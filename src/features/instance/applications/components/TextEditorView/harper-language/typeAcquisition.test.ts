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
		])('%s', (_label, code) => {
			expect(findAcquirableSpecifiers(code)).toEqual(['react']);
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
});
