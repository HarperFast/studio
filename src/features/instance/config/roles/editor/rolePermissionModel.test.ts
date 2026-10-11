import {
	getAttributeViews,
	getEditableDatabaseNames,
	getPreservedEntries,
	getRoleType,
	getTableEntry,
	getVisualEditorBlockers,
	isTableScopedToAttributes,
	parseRolePermissionText,
	removeEntriesNotInSchema,
	serializeRolePermission,
	setAttributeAction,
	setAttributeScoping,
	setDatabaseAction,
	setRoleType,
	setStructureUser,
	setTableAction,
} from '@/features/instance/config/roles/editor/rolePermissionModel';
import { InstanceDatabaseMap, InstanceTable, LocalRolePermission } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';

function table(name: string, attributes: string[], primaryKey = 'id'): InstanceTable {
	return {
		schema: 'data',
		name,
		primary_key: primaryKey,
		audit: false,
		schema_defined: true,
		db_size: 0,
		sources: [],
		attributes: attributes.map((attribute) => ({ attribute, is_primary_key: attribute === primaryKey })),
	} as unknown as InstanceTable;
}

const schema: InstanceDatabaseMap = {
	data: {
		dog: table('dog', ['id', 'name', 'breed', '__createdtime__']),
		cat: table('cat', ['id', 'name']),
	},
	dev: { thing: table('thing', ['id']) },
};
const VERSION = '5.3.1';
const dogAttributes = ['id', 'name', 'breed', '__createdtime__'];

const entry = (read: boolean, insert = false, update = false, del = false, attributes: unknown = []) => ({
	read,
	insert,
	update,
	delete: del,
	attribute_permissions: attributes,
});

const asPermission = (value: unknown) => value as LocalRolePermission;

describe('parseRolePermissionText', () => {
	it('returns only JSON objects', () => {
		expect(parseRolePermissionText('{"super_user":true}')).toEqual({ super_user: true });
		expect(parseRolePermissionText('[]')).toBeNull();
		expect(parseRolePermissionText('null')).toBeNull();
		expect(parseRolePermissionText('{"super_user":')).toBeNull();
		expect(parseRolePermissionText('')).toBeNull();
	});
});

describe('getEditableDatabaseNames', () => {
	it('skips a database named operations once the key is the allowlist', () => {
		const withOperations = { ...schema, operations: { t: table('t', ['id']) } };
		expect(getEditableDatabaseNames(withOperations, '5.3.1')).toEqual(['data', 'dev']);
		expect(getEditableDatabaseNames(withOperations, '4.7.40')).toEqual(['data', 'dev', 'operations']);
	});
});

describe('getVisualEditorBlockers', () => {
	it('accepts the shapes Harper stores, including null attribute_permissions', () => {
		const permission = asPermission({
			super_user: false,
			structure_user: ['dev'],
			operations: ['read_only'],
			data: { tables: { dog: entry(true, false, false, false, null), cat: entry(true) } },
		});
		expect(getVisualEditorBlockers(permission, schema, VERSION)).toEqual([]);
	});

	it('names every shape the GUI cannot represent', () => {
		const permission = asPermission({
			super_user: 'yes',
			structure_user: { dev: true },
			operations: { tables: {} },
			data: {
				tables: {
					dog: { read: true, insert: false, update: false, attribute_permissions: 'all' },
					cat: entry(true, false, false, false, [{ attribute_name: 'name', read: true }, { read: true }]),
				},
			},
			dev: 'everything',
		});
		const blockers = getVisualEditorBlockers(permission, schema, VERSION);
		expect(blockers).toEqual([
			'"super_user" must be true or false.',
			'"structure_user" must be true, false, or a list of database names.',
			'"operations" is not a list of operation names.',
			'"data.dog": delete must each be true or false.',
			'"data.dog.attribute_permissions" must be a list.',
			'"data.cat.attribute_permissions": "name" needs read, insert and update set to true or false.',
			'"data.cat.attribute_permissions" has an entry without an attribute_name.',
			'The entry for database "dev" is not an object.',
		]);
	});

	it('refuses both exclusive flags, duplicate attributes and the pre-2.2 format', () => {
		expect(getVisualEditorBlockers({ super_user: true, cluster_user: true }, schema, VERSION)).toEqual([
			'"super_user" and "cluster_user" cannot both be true.',
		]);
		const duplicated = asPermission({
			data: {
				tables: {
					cat: entry(true, false, false, false, [
						{ attribute_name: 'name', read: true, insert: false, update: false },
						{ attribute_name: 'name', read: false, insert: false, update: false },
					]),
				},
			},
		});
		expect(getVisualEditorBlockers(duplicated, schema, VERSION)).toEqual([
			'"data.cat.attribute_permissions" lists "name" more than once.',
		]);
		const legacy = asPermission({ data: { tables: { cat: { ...entry(true), attribute_restrictions: [] } } } });
		expect(getVisualEditorBlockers(legacy, schema, VERSION)).toHaveLength(1);
		expect(getVisualEditorBlockers({}, schema, '2.1.2')).toHaveLength(1);
		// An unparseable version is not evidence of a pre-2.2 instance.
		expect(getVisualEditorBlockers({}, schema, 'unknown')).toEqual([]);
	});

	it('ignores the shape of entries the GUI does not render', () => {
		const permission = asPermission({ gone: 42, data: { tables: { removed: 'x' } } });
		expect(getVisualEditorBlockers(permission, schema, VERSION)).toEqual([]);
	});
});

describe('getPreservedEntries / removeEntriesNotInSchema', () => {
	const permission = asPermission({
		structure_user: ['dev', 'gone'],
		gone: { tables: { x: entry(true) } },
		data: {
			describe: true,
			tables: {
				dog: {
					...entry(true, false, false, false, [
						{ attribute_name: 'name', read: true, insert: false, update: false, delete: true },
						{ attribute_name: 'computed_score', read: true, insert: false, update: false },
					]),
					extra: 1,
				},
				removed: entry(true),
			},
		},
	});

	it('separates what Harper would reject from what is merely not shown', () => {
		expect(getPreservedEntries(permission, schema, VERSION)).toEqual({
			notInSchema: ['structure_user database "gone"', 'database "gone"', 'table "data.removed"'],
			notShown: [
				'"data.describe"',
				'"data.dog.extra"',
				'"delete" on attribute "data.dog.name"',
				'attribute "data.dog.computed_score"',
			],
		});
	});

	it('removes only the entries not in the schema and keeps the rest verbatim', () => {
		const cleaned = removeEntriesNotInSchema(permission, schema, VERSION);
		expect(cleaned).toEqual({
			structure_user: ['dev'],
			data: { describe: true, tables: { dog: (permission.data as { tables: { dog: unknown } }).tables.dog } },
		});
		expect(getPreservedEntries(cleaned, schema, VERSION).notInSchema).toEqual([]);
	});

	it('reports an inert operations value below the allowlist floor without removing it', () => {
		const old = asPermission({ operations: ['read_only'] });
		expect(getPreservedEntries(old, schema, '4.7.40').notShown).toEqual([
			'"operations" (has no effect before Harper 5.0)',
		]);
		expect(removeEntriesNotInSchema(old, schema, '4.7.40')).toEqual(old);
	});
});

describe('role type and structure_user', () => {
	it('sets the exclusive flag and keeps the rest of the document for the session', () => {
		const permission = asPermission({ super_user: false, data: { tables: { cat: entry(true) } } });
		const superUser = setRoleType(permission, 'super_user');
		expect(superUser).toEqual({ super_user: true, data: permission.data });
		expect(getRoleType(superUser)).toBe('super_user');

		const back = setRoleType(superUser, 'standard');
		expect(back).toEqual(permission);
		// A flag the document never carried is not added just to say false.
		expect(setRoleType({}, 'standard')).toEqual({});
		expect(setRoleType({ super_user: true }, 'cluster_user')).toEqual({ super_user: false, cluster_user: true });
	});

	it('writes structure_user to the top and does not add a false one', () => {
		const permission = asPermission({ data: { tables: {} } });
		expect(Object.keys(setStructureUser(permission, ['dev']))).toEqual(['structure_user', 'data']);
		expect(setStructureUser(permission, false)).toBe(permission);
		expect(setStructureUser({ structure_user: true }, false)).toEqual({ structure_user: false });
	});
});

describe('table actions', () => {
	it('creates the entry Harper requires when granting on an unlisted table, and is a no-op when revoking one', () => {
		const granted = setTableAction({}, 'data', 'cat', 'read', true);
		expect(granted).toEqual({ data: { tables: { cat: entry(true) } } });
		expect(setTableAction({}, 'data', 'cat', 'read', false)).toEqual({});
	});

	it('preserves every key it does not touch', () => {
		const permission = asPermission({
			data: { describe: true, tables: { cat: { ...entry(true, false, false, false, null), extra: 1 } } },
		});
		expect(setTableAction(permission, 'data', 'cat', 'insert', true)).toEqual({
			data: { describe: true, tables: { cat: { ...entry(true, true, false, false, null), extra: 1 } } },
		});
	});

	it('revokes an action on the attributes too, which role validation requires', () => {
		const scoped = asPermission({
			data: {
				tables: {
					dog: entry(true, true, false, false, [
						{ attribute_name: 'name', read: true, insert: true, update: false },
						{ attribute_name: 'breed', read: false, insert: true, update: false },
					]),
				},
			},
		});
		const next = setTableAction(scoped, 'data', 'dog', 'insert', false);
		expect(getTableEntry(next, 'data', 'dog')?.attribute_permissions).toEqual([
			{ attribute_name: 'name', read: true, insert: false, update: false },
			{ attribute_name: 'breed', read: false, insert: false, update: false },
		]);
	});

	it('sets a database-wide action in one pass, keeping table order', () => {
		const permission = asPermission({ data: { tables: { cat: entry(false, true) } } });
		const next = setDatabaseAction(permission, 'data', ['dog', 'cat'], 'read', true);
		expect(next).toEqual({ data: { tables: { cat: entry(true, true), dog: entry(true) } } });
		expect(Object.keys((next.data as { tables: object }).tables)).toEqual(['cat', 'dog']);
		expect(setDatabaseAction({}, 'data', ['dog', 'cat'], 'read', false)).toEqual({});
	});

	it('keeps a __proto__ database and table as own keys', () => {
		const next = setTableAction({}, '__proto__', '__proto__', 'read', true);
		const roundTripped = JSON.parse(JSON.stringify(next)) as object;
		const database = Object.getOwnPropertyDescriptor(roundTripped, '__proto__')?.value as { tables: object };
		expect(Object.getOwnPropertyDescriptor(database.tables, '__proto__')?.value).toEqual(entry(true));
		expect(getTableEntry(next, '__proto__', '__proto__')).toEqual(entry(true));
	});
});

describe('attribute scoping', () => {
	it('lists every attribute with the table access when turned on, so nothing changes at that moment', () => {
		const permission = asPermission({ data: { tables: { dog: entry(true, true) } } });
		const scoped = setAttributeScoping(permission, 'data', 'dog', true, dogAttributes);
		const dog = getTableEntry(scoped, 'data', 'dog');
		expect(isTableScopedToAttributes(dog)).toBe(true);
		expect(dog?.attribute_permissions).toEqual([
			{ attribute_name: 'id', read: true, insert: true, update: false },
			{ attribute_name: 'name', read: true, insert: true, update: false },
			{ attribute_name: 'breed', read: true, insert: true, update: false },
			// Harper only applies read to a timestamp attribute.
			{ attribute_name: '__createdtime__', read: true, insert: false, update: false },
		]);
		const off = setAttributeScoping(scoped, 'data', 'dog', false, dogAttributes);
		expect(getTableEntry(off, 'data', 'dog')).toEqual(entry(true, true));
		const restored = setAttributeScoping(off, 'data', 'dog', true, dogAttributes, dog?.attribute_permissions ?? []);
		expect(restored).toEqual(scoped);
	});

	it('derives an unlisted primary key from the listed attributes, as permissionsTranslator does', () => {
		const dog = entry(true, true, false, false, [
			{ attribute_name: 'name', read: true, insert: false, update: false },
			{ attribute_name: '__createdtime__', read: true, insert: true, update: true },
		]);
		const views = getAttributeViews(dog as never, dogAttributes, 'id');
		expect(views.map(({ name, read, insert, update, derived }) => ({ name, read, insert, update, derived }))).toEqual([
			{ name: 'id', read: true, insert: false, update: false, derived: true },
			{ name: 'name', read: true, insert: false, update: false, derived: false },
			// Not listed in a scoped table: no access.
			{ name: 'breed', read: false, insert: false, update: false, derived: false },
			// Its stored insert/update are ignored by Harper, so they do not reach the key either.
			{ name: '__createdtime__', read: true, insert: false, update: false, derived: false },
		]);
	});

	it('adds an unlisted attribute with its effective access before flipping one action', () => {
		const permission = asPermission({
			data: {
				tables: {
					dog: entry(true, false, false, false, [
						{ attribute_name: 'name', read: true, insert: false, update: false },
					]),
				},
			},
		});
		// The derived key keeps read when it becomes explicit, so revoking nothing else by accident.
		const pkInsert = setAttributeAction(permission, 'data', 'dog', dogAttributes, 'id', 'id', 'insert', true);
		const dog = getTableEntry(pkInsert, 'data', 'dog');
		expect(dog?.attribute_permissions).toEqual([
			{ attribute_name: 'name', read: true, insert: false, update: false },
			{ attribute_name: 'id', read: true, insert: true, update: false },
		]);
		// Granting an attribute an action its table lacks grants it on the table too.
		expect(dog?.insert).toBe(true);

		const revoked = setAttributeAction(pkInsert, 'data', 'dog', dogAttributes, 'id', 'name', 'read', false);
		expect(getTableEntry(revoked, 'data', 'dog')?.attribute_permissions?.[0]).toEqual({
			attribute_name: 'name',
			read: false,
			insert: false,
			update: false,
		});
		expect(getTableEntry(revoked, 'data', 'dog')?.read).toBe(true);
	});
});

describe('serializeRolePermission', () => {
	it('floats the role flags above the databases', () => {
		const text = serializeRolePermission(asPermission({ data: { tables: {} }, operations: [], super_user: false }));
		expect(Object.keys(JSON.parse(text) as object)).toEqual(['super_user', 'operations', 'data']);
	});
});
