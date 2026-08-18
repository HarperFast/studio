import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PLUGIN = resolve(import.meta.dirname, 'comment-budget.js');

/**
 * oxlint's own `bin` entry, not the `node_modules/.bin` shim: the shim is a POSIX shell script with
 * a separate `.cmd` twin on Windows, and Node refuses to spawn a `.cmd` without `shell: true`
 * (CVE-2024-27980 hardening). The declared bin is a plain Node script, so running it through
 * `process.execPath` works the same everywhere. Read from package.json rather than hardcoded
 * because pnpm resolves `oxlint` to a store path outside this worktree.
 */
const OXLINT_PACKAGE = createRequire(import.meta.url).resolve('oxlint/package.json');
const OXLINT_CLI = resolve(dirname(OXLINT_PACKAGE), JSON.parse(readFileSync(OXLINT_PACKAGE, 'utf8')).bin.oxlint);

/**
 * Lint `source` by shelling out to the real oxlint. Going through the binary rather than calling
 * `create()` directly is the point: it is the only way to prove the rule still works against
 * oxlint's own AST and SourceCode implementation, which is where breakage would come from.
 *
 * @returns {{ scope: 'file' | 'block', line: number, count: number, max: number }[]}
 */
function lint(source, options = {}) {
	const dir = mkdtempSync(join(tmpdir(), 'comment-budget-'));
	try {
		writeFileSync(
			join(dir, '.oxlintrc.json'),
			JSON.stringify({
				jsPlugins: [PLUGIN],
				rules: { 'comment-budget/comment-budget': ['warn', options] },
			}),
		);
		writeFileSync(join(dir, 'fixture.ts'), source);

		let stdout;
		try {
			stdout = execFileSync(
				process.execPath,
				[OXLINT_CLI, '-c', '.oxlintrc.json', '--format', 'json', 'fixture.ts'],
				{ cwd: dir, encoding: 'utf8' },
			);
		} catch (error) {
			// oxlint exits non-zero when any *other* default rule errors on the fixture; the report we
			// care about is still on stdout.
			stdout = error.stdout;
			if (!stdout) { throw error; }
		}

		return JSON.parse(stdout).diagnostics
			.filter((diagnostic) => diagnostic.code.startsWith('comment-budget'))
			.map((diagnostic) => ({
				scope: diagnostic.message.startsWith('This file') ? 'file' : 'block',
				line: diagnostic.labels[0].span.line,
				count: Number(diagnostic.message.match(/has (\d+)/)[1]),
				max: Number(diagnostic.message.match(/budget is (\d+)/)[1]),
			}));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

describe('comment-budget', () => {
	it('stays quiet while a file is within budget', () => {
		expect(lint(
			`// one
			const a = 1;
			// two
			export const b = a;`,
			{ maxPerFile: 2 },
		)).toEqual([]);
	});

	it('reports once per file, on the comment that broke the budget', () => {
		const [report, ...rest] = lint(
			`// 1
			const a = 1;
			// 2
			const b = 2;
			// 3
			const c = 3;
			// 4
			export const d = a + b + c;`,
			{ maxPerFile: 2 },
		);

		expect(rest).toEqual([]);
		expect(report).toEqual({ scope: 'file', line: 5, count: 4, max: 2 });
	});

	it('charges a run of adjacent comment lines as a single site', () => {
		const paragraph = `// the exchange rounds half-up, but our ledger rounds half-even, so the two
			// disagree by a cent on exact halves; reconcile against the ledger, not the feed
			export const rate = 1;`;

		expect(lint(paragraph, { maxPerFile: 1 })).toEqual([]);
	});

	it('starts a new site once a blank line breaks the run', () => {
		expect(lint(
			`// first

			// second
			export const a = 1;`,
			{ maxPerFile: 1 },
		)).toMatchObject([{ scope: 'file', count: 2 }]);
	});

	it('never charges for linter, compiler, or formatter directives', () => {
		expect(lint(
			`/// <reference types="vite/client" />
			/// <reference lib="dom" />
			/// <amd-module name="Validator" />
			/* eslint-disable no-console */
			// oxlint-disable-next-line no-debugger
			// @ts-expect-error deliberate
			// dprint-ignore
			/* c8 ignore next */
			// #region setup
			// #endregion
			// prettier-ignore
			// biome-ignore lint: deliberate
			// @vite-ignore
			/* istanbul ignore next */
			// type-coverage:ignore-next-line
			/* #__PURE__ */
			export const a = 1;`,
			{ maxPerFile: 0 },
		)).toEqual([]);
	});

	it('exempts doc comments by default and charges them on request', () => {
		const source = `/** The canonical retry ceiling. */
			export const MAX_RETRIES = 3;`;

		expect(lint(source, { maxPerFile: 0 })).toEqual([]);
		expect(lint(source, { maxPerFile: 0, allowJSDoc: false })).toMatchObject([{ scope: 'file', count: 1 }]);
	});

	it('charges a block banner comment, which only looks like a doc comment', () => {
		expect(lint(
			`/*** Section: pricing ***/
			export const a = 1;`,
			{ maxPerFile: 0 },
		)).toMatchObject([{ scope: 'file', count: 1 }]);
	});

	it('reports a block that is over budget even when the file is not', () => {
		const [report, ...rest] = lint(
			`export function f(n: number) {
				// 1
				let x = n;
				// 2
				x += 1;
				// 3
				return x;
			}`,
			{ maxPerFile: 99, maxPerBlock: 2 },
		);

		expect(rest).toEqual([]);
		expect(report).toEqual({ scope: 'block', line: 6, count: 3, max: 2 });
	});

	it('charges each comment to its innermost block, not to every enclosing one', () => {
		expect(lint(
			`export function f(n: number) {
				// outer
				if (n > 0) {
					// inner 1
					n += 1;
					// inner 2
					n += 2;
				}
				return n;
			}`,
			{ maxPerFile: 99, maxPerBlock: 2 },
		)).toEqual([]);
	});

	it('counts trailing comments, which are the easiest ones to leave behind', () => {
		expect(lint(
			`export const a = 1; // why 1
			export const b = 2; // why 2`,
			{ maxPerFile: 1 },
		)).toMatchObject([{ scope: 'file', count: 2 }]);
	});

	it('treats a bare CR as a line boundary, so the comment after code is still own-line', () => {
		// Scanning left for indentation has to stop at CR too. If it only stops at LF it runs on into
		// the previous line, finds the `;`, and calls both of these trailing asides instead of one
		// paragraph.
		const crOnly = ['const a = 1;', '// one', '// two', 'export const b = a;'].join('\r');

		expect(lint(crOnly, { maxPerFile: 0 })).toMatchObject([{ scope: 'file', count: 1 }]);
	});

	it('scopes a switch case separately from the function body around it', () => {
		expect(lint(
			`export function f(kind: string) {
				// dispatch on the wire tag, not the display name
				switch (kind) {
					case 'a':
						// legacy servers send this lowercased
						return 1;
					default:
						return 0;
				}
			}`,
			{ maxPerFile: 99, maxPerBlock: 1 },
		)).toEqual([]);
	});

	it('charges an annotated data literal once, not once per annotated row', () => {
		const table = `export const CASES = [
			'org',   // no body
			'org-',  // empty body
			'Org-1', // uppercase prefix is a title, not an id
			'org 1', // space, not a hyphen
		];`;

		expect(lint(table, { maxPerFile: 0 })).toMatchObject([{ scope: 'file', count: 1 }]);
	});

	it('does the same for an annotated object literal', () => {
		const table = `export const LIMITS = {
			retries: 3,     // matches the gateway's own ceiling
			backoffMs: 250, // half the observed p50 round trip
		};`;

		expect(lint(table, { maxPerFile: 0 })).toMatchObject([{ scope: 'file', count: 1 }]);
	});

	it('charges two sibling literals separately', () => {
		const tables = `export const A = [
			1, // one
		];
		export const B = [
			2, // two
		];`;

		expect(lint(tables, { maxPerFile: 0 })).toMatchObject([{ scope: 'file', count: 2 }]);
	});

	it('does not exempt own-line prose that merely sits inside a literal', () => {
		const prose = `export const CASES = [
			// the parser accepted this until #1199
			'org-1',

			// and this one only on 4.7
			'org-2',
		];`;

		expect(lint(prose, { maxPerFile: 0 })).toMatchObject([{ scope: 'file', count: 2 }]);
	});

	it('does not let a literal absorb comments from a method body nested inside it', () => {
		const handlers = `export const handlers = {
			run(n: number) {
				let x = n; // step one
				x += 1;    // step two
				x *= 2;    // step three
				return x;  // step four
			},
		};`;

		expect(lint(handlers, { maxPerFile: 99, maxPerBlock: 2 })).toMatchObject([{ scope: 'block', count: 4 }]);
	});

	it('charges prose that merely opens with a directive-shaped near-miss', () => {
		const nearMisses = `export function f(n: number) {
			// eslint-based behavior differs here
			let x = n;
			// webpack: this build injects the value
			x += 1;
			// prettier-style formatting is nicer here
			x *= 2;
			// @ts-experts disagree about this
			x -= 3;
			// type-coverage: not great in here
			return x;
		}`;

		expect(lint(nearMisses, { maxPerFile: 99, maxPerBlock: 2 })).toMatchObject([{ scope: 'block', count: 5 }]);
	});

	it('charges prose that merely opens with a tool name', () => {
		const prose = `export function f(n: number) {
			// eslint has different behavior here
			let x = n;
			// webpack injects this value
			x += 1;
			// oxlint used to complain about this
			x *= 2;
			// global state is shared across these
			return x;
		}`;

		expect(lint(prose, { maxPerFile: 99, maxPerBlock: 2 })).toMatchObject([{ scope: 'block', count: 4 }]);
	});

	it('still exempts the inline eslint config form, which is not prose', () => {
		expect(lint(
			`/* eslint no-console: "error" */
			// webpackChunkName: "editor"
			export const a = 1;`,
			{ maxPerFile: 0 },
		)).toEqual([]);
	});

	it('honours an inline disable directive for the rule itself', () => {
		expect(lint(
			`// oxlint-disable comment-budget/comment-budget
			// 1
			const a = 1;
			// 2
			export const b = a;`,
			{ maxPerFile: 0 },
		)).toEqual([]);
	});
});
