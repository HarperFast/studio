import { describe, expect, it } from 'vitest';
import { isHandlerModule, readModuleExports } from './handlerExports';

describe('readModuleExports', () => {
	it('lists the value exports a job could name, default first', () => {
		const source = `
import { tables } from 'harper';
export default async function cleanup() {}
export async function syncRates(context) {}
export function* generator() {}
export const snapshot = async () => {};
export const single = ctx => ctx;
export const viaFunction = function () {};
export let counter = 0;
export const settings = { every: '5m' };
function internal() {}
const helper = () => {};
export { internal, helper as renamed };
export class NotCallable {}
export type Options = { a: number };
export interface Shape {}
export type { Shape as Other };
`;
		expect(readModuleExports(source)).toEqual({
			names: ['default', 'generator', 'internal', 'renamed', 'single', 'snapshot', 'syncRates', 'viaFunction'],
			incomplete: false,
		});
	});

	it('ignores commented-out exports but keeps one after a URL in a string', () => {
		const source = `
// export function oldJob() {}
/* export function older() {} */
const url = 'https://example.com'; export function live() {}
`;
		expect(readModuleExports(source).names).toEqual(['live']);
	});

	it('ignores exports written inside strings and templates', () => {
		const source = [
			'const docs = "export function fake() {}";',
			"const other = 'export const alsoFake = 1, \\'quoted\\'';",
			'const tpl = `export function templated() {}\nexport const multiline = 1`;',
			'export function real() {}',
		].join('\n');
		expect(readModuleExports(source).names).toEqual(['real']);
	});

	it('reads past regex literals and template interpolations', () => {
		const source = [
			'const quote = /["\'`]/g; export function afterRegex() {}',
			'const ratio = total / count; export function afterDivision() {}',
			'function check(text) { return /export function fake\\/\\//.test(text); }',
			"const nested = `a ${items.map((item) => `b ${item}`).join('}')} c`; export function afterTemplate() {}",
			"const tick = `x ${'`'} y`; export function afterQuotedTick() {}",
		].join('\n');
		expect(readModuleExports(source).names).toEqual([
			'afterDivision',
			'afterQuotedTick',
			'afterRegex',
			'afterTemplate',
		]);
	});

	it('says the list may be short when the module re-exports another', () => {
		expect(readModuleExports("export * from './jobs.js';\nexport function a() {}")).toEqual({
			names: ['a'],
			incomplete: true,
		});
	});

	it('reads `export { x as default }` as the default export', () => {
		expect(readModuleExports('function run() {}\nexport { run as default };').names).toEqual(['default']);
	});
});

describe('isHandlerModule', () => {
	it.each([
		['jobs.ts', true],
		['jobs.mjs', true],
		['lib/jobs.cjs', true],
		['jobs.mts', true],
		['types.d.ts', false],
		['jobs#nightly.js', false],
		['#nightly.js', false],
		['config.yaml', false],
		['schema.graphql', false],
	])('%j is %j', (path, expected) => {
		expect(isHandlerModule(path)).toBe(expected);
	});
});
