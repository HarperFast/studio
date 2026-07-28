import { describe, expect, it, vi } from 'vitest';

// `typeAcquisition` re-exports monaco's language-service registrations at module
// scope, which need a DOM. The scanner under test touches none of it.
vi.mock('@/lib/monaco/languageServices', () => ({ json: {}, typescript: {} }));

const { findAcquirableSpecifiers } = await import('./typeAcquisition');

describe('findAcquirableSpecifiers', () => {
	describe('real imports it must keep finding', () => {
		it.each([
			['default import', `import React from 'react'`, ['react']],
			['named imports', `import { useState, useEffect } from 'react'`, ['react']],
			['namespace import', `import * as path from 'node:path'`, []],
			['star re-export', `export * from 'lodash'`, ['lodash']],
			['named re-export', `export { debounce } from 'lodash'`, ['lodash']],
			['type-only import', `import type { Config } from 'vite'`, ['vite']],
			['default + named', `import ky, { HTTPError } from 'ky'`, ['ky']],
			['aliased named', `import { a as b } from 'zod'`, ['zod']],
			['bare side-effect import', `import 'reflect-metadata'`, ['reflect-metadata']],
			['dynamic import', `const m = await import('nanoid')`, ['nanoid']],
			['require call', `const x = require('uuid')`, ['uuid']],
			['scoped package', `import { z } from '@scope/pkg'`, ['@scope/pkg']],
			['deep import', `import { merge } from 'lodash/fp'`, ['lodash/fp']],
			['double quotes', `import React from "react"`, ['react']],
		])('%s', (_label, code, expected) => {
			expect(findAcquirableSpecifiers(code)).toEqual(expected);
		});

		it('spans newlines inside a multi-line named import', () => {
			const code = `import {\n\tuseState,\n\tuseEffect,\n} from 'react'`;
			expect(findAcquirableSpecifiers(code)).toEqual(['react']);
		});

		// A comment is legal anywhere in an import clause, and annotating a named
		// import is common. The clause matcher excludes a bare `/` to stop it walking
		// out of a statement, so it has to recognise comments as units or it misses
		// the whole import — the package silently stops getting types.
		it.each([
			['line comment inside a named block', `import {\n\tuseState, // hooks\n\tuseEffect,\n} from 'react'`],
			['block comment inside a named block', `import {\n\tuseState, /* hooks */\n\tuseEffect,\n} from 'react'`],
			['jsdoc between the clause and `from`', `import { useState } /** why */ from 'react'`],
			['line comment between the clause and `from`', `import { useState } // why\nfrom 'react'`],
			['comment before a type modifier', `import /* types only */ type { FC } from 'react'`],
			['CRLF line endings around a comment', "import {\r\n\tuseState, // hooks\r\n} from 'react'"],
			['multi-line jsdoc inside a named block', `import {\n\ta,\n\t/**\n\t * why\n\t */\n\tuseState,\n} from 'react'`],
		])('%s', (_label, code) => {
			expect(findAcquirableSpecifiers(code)).toEqual(['react']);
		});

		// The clause is bounded so a failed match stays cheap (see MAX_IMPORT_CLAUSE).
		// The bound has to clear real code by a wide margin: the longest clause in this
		// repo is 351 chars, and the longest across ~13k `node_modules` declaration
		// files is a 1.6 KB barrel re-export, which is the shape measured here.
		it('resolves a barrel re-export far larger than any in node_modules', () => {
			const names = Array.from({ length: 200 }, (_, i) => `exportedName${i}`).join(', ');
			const code = `export { ${names} } from './route.js'`;
			expect(code.length).toBeGreaterThan(2800);
			expect(findAcquirableSpecifiers(code)).toEqual([]); // relative, but it must still parse
			expect(findAcquirableSpecifiers(`export { ${names} } from 'lodash'`)).toEqual(['lodash']);
		});

		it('finds every import in a realistic Harper resource file', () => {
			const code = [
				`import { tables } from 'harper';`,
				`import { z } from 'zod';`,
				`import lodash from 'lodash';`,
				``,
				`export const { Dog } = tables;`,
			].join('\n');
			// `harper` is provided by the editor's own globals, never acquired from npm.
			expect(findAcquirableSpecifiers(code)).toEqual(['zod', 'lodash']);
		});
	});

	describe('non-packages it must never send to the CDN', () => {
		it.each([
			['relative path', `import x from './local'`],
			['parent-relative path', `import x from '../local'`],
			['absolute path', `import x from '/abs'`],
			['@/ alias', `import x from '@/lib/thing'`],
			['harper global', `import { tables } from 'harper'`],
			['harperdb global', `import { tables } from 'harperdb'`],
			['node: builtin', `import fs from 'node:fs'`],
			['bare node builtin', `import fs from 'fs'`],
			['css asset', `import './styles.css'`],
			['json asset', `import data from './data.json'`],
		])('%s', (_label, code) => {
			expect(findAcquirableSpecifiers(code)).toEqual([]);
		});
	});

	// Regression for the daily RUM review of 2026-07-28: 18 requests to
	// data.jsdelivr.com/v1/package/resolve/npm/… 404'd in a single session, one of
	// them for the specifier `Known Fraudster Risk`. A lazy `[^'";]*?` between
	// `import`/`export` and `from` crossed newlines, so a lowercase `from "…"` in a
	// following comment or SQL/GraphQL template literal was scanned as a package
	// name — sending user-authored table and type names off-origin to jsDelivr.
	describe('does not mine package names out of prose (RUM 2026-07-28)', () => {
		it.each([
			[
				'line comment after a semicolon-free export',
				`export const { Dog } = tables\n// everything below reads from "Known Fraudster Risk"\n`,
			],
			[
				'jsdoc block after an exported interface',
				`export interface Risk {\n\t/** derived from "Known Fraudster Risk" table */\n\tid: string\n}`,
			],
			[
				'lowercase SQL in a template literal',
				'export const q = `select * from "Known Fraudster Risk"`',
			],
			[
				'GraphQL SDL in a template literal',
				'export const typeDefs = `type Query { risks: [Risk] }`\n// generated from "Known Fraudster Risk"',
			],
			[
				'prose mentioning a table after an import',
				`import { tables } from 'harper'\n// we select from "Known Fraudster Risk" on demand`,
			],
		])('%s', (_label, code) => {
			expect(findAcquirableSpecifiers(code)).not.toContain('Known Fraudster Risk');
		});

		// The npm-grammar gate only stops phrases it can recognise as impossible names.
		// A single lowercase table name — `customers`, and Harper apps are full of them
		// — is a perfectly legal package name, so for these the clause matcher is the
		// only thing standing between user content and the CDN.
		//
		// That makes them the cases to pin now that the clause matcher consumes comments
		// so annotated named imports keep resolving. A comment alternative that can be
		// partially consumed (a plain `//[^\n]*`, which backtracks) lets the matcher stop
		// mid-comment and take the `from "…"` out of the rest of it — every shape below
		// resolves to `customers` again under that spelling, and did before this fix.
		it.each([
			['line comment after a named export', `export { Dog }\n// each row is read from "customers"`],
			['block comment after a named export', `export { Dog }\n/* each row is read from "customers" */`],
			['line comment after a star export', `export *\n// projected from "customers"`],
			['line comment after an empty export', `export {}\n// hydrated from "customers"`],
			['comment where `from` itself is commented out', `import { Dog }\n// from "customers"`],
			[
				'jsdoc prose in a downloaded declaration file',
				`export {}\n/**\n * Read from "customers".\n */\nexport declare const x: string`,
			],
		])('%s', (_label, code) => {
			expect(findAcquirableSpecifiers(code)).toEqual([]);
		});

		it('keeps the legitimate import from a file that also contains such prose', () => {
			const code = `import { z } from 'zod'\n// hydrated from "Known Fraudster Risk"\nexport const s = z.string()`;
			expect(findAcquirableSpecifiers(code)).toEqual(['zod']);
		});

		it.each([
			['whitespace', 'Known Fraudster Risk'],
			['leading dot in a name position', 'not a package'],
			['uppercase phrase with punctuation', 'Some Table (v2)'],
			['tab', 'pkg\tname'],
			['newline', 'pkg\nname'],
			['colon', 'weird:name'],
			['empty scope', '@/'],
		])('rejects the invalid specifier %s even when quoted as an import target', (_label, specifier) => {
			expect(findAcquirableSpecifiers(`import x from '${specifier}'`)).toEqual([]);
		});

		it('rejects a specifier longer than npm allows', () => {
			const tooLong = 'a'.repeat(215);
			expect(findAcquirableSpecifiers(`import x from '${tooLong}'`)).toEqual([]);
			expect(findAcquirableSpecifiers(`import x from '${'a'.repeat(214)}'`)).toEqual(['a'.repeat(214)]);
		});

		it('still allows legacy mixed-case package names', () => {
			expect(findAcquirableSpecifiers(`import JSONStream from 'JSONStream'`)).toEqual(['JSONStream']);
		});
	});

	// The clause match is lazy, so an attempt that can never succeed walks toward
	// end-of-input — and every later `import`/`export` walks it again. That is
	// quadratic, and it runs on the main thread: `acquireApplicationTypes` scans every
	// project script joined together, and ata re-scans every downloaded `.d.ts`.
	// Neither needs a hostile file, just an unterminated comment from a mid-edit save
	// or a truncated CDN response.
	//
	// Wall-clock assertions, because the bound in the scanner is the only thing that
	// makes these finish. Measured on these exact inputs: every case lands in
	// 218-305ms bounded, against 7.5s-22s with the bound removed — so the budget below
	// leaves ~10x headroom for a slow machine while still being an order of magnitude
	// under the regression it exists to catch. The last two shapes need no comments at
	// all; they were already quadratic before comments were admitted, at ~2.5s.
	const LINEAR_SCAN_BUDGET_MS = 3000;

	describe('stays linear on input no match can consume', () => {
		it.each([
			['unterminated block comment', 'import /* unterminated\n'.repeat(32_000)],
			['unterminated block comment, no newlines', 'import /* unterminated '.repeat(32_000)],
			['line comment at the end of a truncated file', 'import a\n'.repeat(32_000) + 'import // truncated'],
			['a long run of clause-legal characters', 'import a '.repeat(32_000)],
		])('%s', (_label, code) => {
			expect(code.length).toBeGreaterThan(250_000);
			const startedAt = performance.now();
			expect(findAcquirableSpecifiers(code)).toEqual([]);
			expect(performance.now() - startedAt).toBeLessThan(LINEAR_SCAN_BUDGET_MS);
		});

		it('still finds every import in a file of that size that does match', () => {
			const code = `import { a } from 'react'\n`.repeat(32_000);
			const startedAt = performance.now();
			expect(findAcquirableSpecifiers(code)).toHaveLength(32_000);
			expect(performance.now() - startedAt).toBeLessThan(LINEAR_SCAN_BUDGET_MS);
		});

		// Every comment below is large and properly terminated, so nothing here is
		// malformed — the clause just never resolves. Expressing it as a bounded
		// quantifier made this throw `RangeError: Maximum call stack size exceeded`,
		// because V8 accumulated a backtracking frame per repetition. Anything that
		// throws out of the scanner aborts acquisition for every source in the pass, so
		// these assert a return value rather than merely "does not hang".
		it.each([
			['a long run of large terminated comments', 1400, ' nofrom\n'],
			['the same run followed by a real `from`', 1600, ` from 'react'`],
		])('%s', (_label, count, tail) => {
			const bigComment = `/*${'x'.repeat(4090)}*/`;
			const code = `import ${bigComment.repeat(count)}${tail}`;
			expect(code.length).toBeGreaterThan(5_000_000);
			const startedAt = performance.now();
			expect(findAcquirableSpecifiers(code)).toEqual([]);
			expect(performance.now() - startedAt).toBeLessThan(LINEAR_SCAN_BUDGET_MS);
		});
	});
});
