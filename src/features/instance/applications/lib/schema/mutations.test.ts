import { describe, expect, it } from 'vitest';
import {
	buildType,
	createTable,
	hasDirective,
	setBoolArg,
	setDirectivePresent,
	setIntArg,
	setStringArg,
} from './mutations';
import { serializeSchema } from './serializeSchema';
import { Directive, formatTypeRef, SchemaDocument, TableModel } from './types';

/** Wrap a single edited table in a document and serialize it (what the GUI does on every change). */
function render(table: TableModel): string {
	const doc: SchemaDocument = {
		segments: [{ kind: 'table', table: { ...table, edited: true } }],
		indent: '\t',
		newline: '\n',
	};
	return serializeSchema(doc);
}

describe('createTable defaults', () => {
	it('matches the old New-Table modal output once named', () => {
		const table = { ...createTable('new-0'), typeName: 'Dog' };
		expect(render(table)).toBe('type Dog @table @export @sealed {\n\tid: ID @primaryKey\n}');
	});
});

describe('directive mutation → serialize', () => {
	const base: TableModel = { ...createTable('new-0'), typeName: 'Dog' };

	it('adds a string arg, and removing it drops the parens', () => {
		const withDb = { ...base, directives: setStringArg(base.directives, 'table', 'database', 'blog') };
		expect(render(withDb)).toContain('@table(database: "blog")');
		const cleared = { ...withDb, directives: setStringArg(withDb.directives, 'table', 'database', '') };
		expect(render(cleared)).toContain('type Dog @table @export @sealed');
	});

	it('omits a boolean arg when it equals its default, emits it otherwise', () => {
		const replicateOff = { ...base, directives: setBoolArg(base.directives, 'table', 'replicate', false, true) };
		expect(render(replicateOff)).toContain('@table(replicate: false)');
		const replicateOn = {
			...replicateOff,
			directives: setBoolArg(replicateOff.directives, 'table', 'replicate', true, true),
		};
		expect(render(replicateOn)).not.toContain('replicate');

		const auditOn = { ...base, directives: setBoolArg(base.directives, 'table', 'audit', true, false) };
		expect(render(auditOn)).toContain('@table(audit: true)');
	});

	it('toggles bare directives on and off', () => {
		const noExport = { ...base, directives: setDirectivePresent(base.directives, 'export', false) };
		expect(hasDirective(noExport.directives, 'export')).toBe(false);
		expect(render(noExport)).toBe('type Dog @table @sealed {\n\tid: ID @primaryKey\n}');
	});

	it('creates the directive implicitly when setting one of its args', () => {
		const withIndex = {
			...base,
			fields: [{
				...base.fields[0],
				name: 'vec',
				type: buildType('Float', true, false),
				directives: setIntArg(setStringArg([], 'indexed', 'type', 'HNSW'), 'indexed', 'M', 16),
			}],
		};
		expect(render(withIndex)).toContain('vec: [Float] @indexed(type: "HNSW", M: 16)');
	});
});

describe('buildType', () => {
	it('composes list and non-null flags', () => {
		expect(formatTypeRef(buildType('String', false, false))).toBe('String');
		expect(formatTypeRef(buildType('String', false, true))).toBe('String!');
		expect(formatTypeRef(buildType('Float', true, false))).toBe('[Float]');
		expect(formatTypeRef(buildType('Float', true, true))).toBe('[Float]!');
	});
});

describe('setDirectivePresent is a no-op when already in the desired state', () => {
	it('returns the same array reference', () => {
		const directives: Directive[] = [{ name: 'sealed', args: [], hadParens: false }];
		expect(setDirectivePresent(directives, 'sealed', true)).toBe(directives);
	});
});
