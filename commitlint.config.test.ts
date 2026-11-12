import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// pnpm doesn't hoist @commitlint/load and @commitlint/lint, so reach them through the CLI that
// depends on them: the same copies `pnpm commitlint` runs.
const fromCli = createRequire(createRequire(import.meta.url).resolve('@commitlint/cli/package.json'));
const { default: load } = await import(fromCli.resolve('@commitlint/load'));
const { default: lint } = await import(fromCli.resolve('@commitlint/lint'));

const config = await load({}, { file: path.resolve(__dirname, 'commitlint.config.cjs'), cwd: __dirname });

async function errorsFor(message: string) {
	const result = await lint(message, config.rules, {
		parserOpts: config.parserPreset?.parserOpts,
		plugins: config.plugins,
		ignores: config.ignores,
		defaultIgnores: config.defaultIgnores,
	});
	return result.errors.map((error: { name: string }) => error.name);
}

const title = 'feat(full-text): declare full-text indexes in the schema editor, and test searches in the browser';

const squash = `${title} (#2080)

* ${title}

Harper 5.3 indexes a table's text fields for ranked keyword search (#2014).

Closes #2014

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

* Address review feedback

* fix(full-text): harden the index editor and search tester from review

- Synonym replacements that can't survive a trip through the comma-separated text no longer loop React's render.

---------

Co-authored-by: Claude Opus 5.5 <noreply@anthropic.com>
`;

describe('commitlint config', () => {
	it('passes a squash merge whose title fits, though the header with its PR number does not', async () => {
		expect(title).toHaveLength(97);
		expect(await errorsFor(squash)).toEqual([]);
	});

	it('still limits what the author wrote to 100 characters', async () => {
		const long = `${title} abcd`;
		expect(long).toHaveLength(102);

		expect(await errorsFor(long)).toEqual(['header-max-length-before-pr-number']);
		expect(await errorsFor(`${long} (#2080)`)).toEqual(['header-max-length-before-pr-number']);
	});

	it('only discounts a PR number at the very end of the header', async () => {
		const header = `fix(x): (#2080) ${'a'.repeat(84)}`;
		expect(header).toHaveLength(100);

		expect(await errorsFor(header)).toEqual([]);
		expect(await errorsFor(`${header}b`)).toEqual(['header-max-length-before-pr-number']);
	});

	it('gives a header ending in its own reference the same verdict once a squash merge appends another', async () => {
		const fits = `feat(x): ${'a'.repeat(91)}`;
		const tooLong = `${fits}b`;

		for (const header of [`${fits} (#2014)`, `${fits} (#2014) (#2080)`]) {
			expect(await errorsFor(header)).toEqual([]);
		}
		for (const header of [`${tooLong} (#2014)`, `${tooLong} (#2014) (#2080)`]) {
			expect(await errorsFor(header)).toEqual(['header-max-length-before-pr-number']);
		}
	});

	it('rejects a squash merge whose PR title has no type', async () => {
		expect(await errorsFor('Pricing updates (#2090)')).toEqual(
			expect.arrayContaining(['subject-empty', 'type-empty']),
		);
	});
});
