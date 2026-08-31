import { LocalRolePermission } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import {
	checkImportDataPermission,
	checkSchemaTablePermission,
	checkTablePutPermission,
} from './checkSchemaTablePermission';

// The index-signature/boolean-flag shape of LocalRolePermission is awkward to build as a literal, so
// cast minimal stand-ins.
function perm(value: Record<string, unknown>): LocalRolePermission {
	return value as unknown as LocalRolePermission;
}

describe('checkSchemaTablePermission', () => {
	it('denies while the permission is still loading', () => {
		expect(checkSchemaTablePermission(undefined, 'data', 'dog', 'insert')).toBe(false);
	});

	it('allows super_user and structure_user regardless of the specific table', () => {
		expect(checkSchemaTablePermission(perm({ super_user: true }), 'data', 'dog', 'insert')).toBe(true);
		expect(checkSchemaTablePermission(perm({ structure_user: true }), 'data', 'dog', 'insert')).toBe(true);
	});

	// Regression: a restricted (non-structure_user) user whose database grant doesn't list the table
	// used to crash on `tables[tableName][action]` (missing optional chain) -- e.g. opening a table
	// context menu. It must simply deny.
	it('denies (without crashing) when the database has no entry for the table', () => {
		expect(checkSchemaTablePermission(perm({ data: { tables: {} } }), 'data', 'dog', 'insert')).toBe(false);
	});

	it('denies when the database itself is absent from the permission map', () => {
		expect(checkSchemaTablePermission(perm({ data: { tables: {} } }), 'other', 'dog', 'insert')).toBe(false);
	});

	it('reflects the per-action flag on a granted table', () => {
		const permission = perm({
			data: {
				tables: { dog: { read: true, insert: true, update: false, delete: false, attribute_permissions: null } },
			},
		});
		expect(checkSchemaTablePermission(permission, 'data', 'dog', 'insert')).toBe(true);
		expect(checkSchemaTablePermission(permission, 'data', 'dog', 'update')).toBe(false);
	});

	it('reads a database named operations as a table grant, like the server does after an upgrade', () => {
		// permissionsTranslator overwrites the key with the translated table permissions whenever a
		// database of that name exists, so hiding it here would be stricter than Harper.
		const permission = {
			operations: { tables: { dog: { read: true, insert: false, update: false, delete: false } } },
		} as unknown as LocalRolePermission;
		expect(checkSchemaTablePermission(permission, 'operations', 'dog', 'read')).toBe(true);
	});

	it('never reads a real allowlist as a table grant', () => {
		const permission: LocalRolePermission = { operations: ['read_only'] };
		expect(checkSchemaTablePermission(permission, 'operations', 'dog', 'read')).toBe(false);
	});

	it('lets an operations allowlist override a table CRUD grant', () => {
		const tables = {
			data: {
				tables: { dog: { read: true, insert: true, update: false, delete: false, attribute_permissions: null } },
			},
		};
		expect(checkSchemaTablePermission(perm({ operations: ['read_only'], ...tables }), 'data', 'dog', 'insert'))
			.toBe(false);
		expect(checkSchemaTablePermission(perm({ operations: ['read_only'], ...tables }), 'data', 'dog', 'read'))
			.toBe(true);
		expect(
			checkSchemaTablePermission(perm({ operations: ['standard_user'], ...tables }), 'data', 'dog', 'insert'),
		).toBe(true);
	});

	it('lets an operations allowlist override structure_user', () => {
		expect(checkSchemaTablePermission(perm({ structure_user: true, operations: [] }), 'data', 'dog', 'insert'))
			.toBe(false);
		expect(
			checkSchemaTablePermission(
				perm({ structure_user: true, operations: ['read_only'] }),
				'data',
				'dog',
				'delete',
			),
		).toBe(false);
	});

	// verifyPerms clears a super_user before reaching the allowlist.
	it('leaves super_user alone, allowlist or not', () => {
		expect(checkSchemaTablePermission(perm({ super_user: true, operations: [] }), 'data', 'dog', 'insert'))
			.toBe(true);
		expect(
			checkSchemaTablePermission(perm({ super_user: true, operations: ['read_only'] }), 'data', 'dog', 'delete'),
		).toBe(true);
	});
});

describe('checkImportDataPermission', () => {
	const tables = {
		data: {
			tables: { dog: { read: true, insert: true, update: false, delete: false, attribute_permissions: null } },
		},
	};

	it('needs the same insert grant Add Records needs', () => {
		expect(checkImportDataPermission(undefined, 'data', 'dog')).toBe(false);
		expect(checkImportDataPermission(perm({ data: { tables: {} } }), 'data', 'dog')).toBe(false);
		expect(checkImportDataPermission(perm(tables), 'data', 'dog')).toBe(true);
	});

	// Add Records is strictly `insert`; a CSV source needs its load plus the get_job it polls.
	it('accepts a bulk-load grant that an insert would reject', () => {
		const csvOnly = perm({ operations: ['csv_url_load', 'get_job'], ...tables });
		expect(checkImportDataPermission(csvOnly, 'data', 'dog')).toBe(true);
		expect(checkSchemaTablePermission(csvOnly, 'data', 'dog', 'insert')).toBe(false);
	});

	// The Import launcher checks the table it was opened from, but the modal's target is editable, so
	// the submit path re-asks this for whatever table was finally chosen.
	it('answers per destination table, not per launcher', () => {
		const permission = perm({
			operations: ['insert'],
			data: {
				tables: {
					dog: { read: true, insert: true, update: false, delete: false, attribute_permissions: null },
					cat: { read: true, insert: false, update: false, delete: false, attribute_permissions: null },
				},
			},
		});
		expect(checkImportDataPermission(permission, 'data', 'dog')).toBe(true);
		expect(checkImportDataPermission(permission, 'data', 'cat')).toBe(false);
	});

	it('denies when the allowlist reaches no import operation', () => {
		expect(checkImportDataPermission(perm({ operations: ['read_only'], ...tables }), 'data', 'dog')).toBe(false);
		expect(checkImportDataPermission(perm({ super_user: true, operations: [] }), 'data', 'dog')).toBe(true);
	});
});

describe('checkTablePutPermission', () => {
	const writable = { read: true, insert: true, update: true, delete: false, attribute_permissions: null };

	it('denies while the permission is still loading', () => {
		expect(checkTablePutPermission(undefined, 'data', 'dog')).toBe(false);
	});

	it('allows super_user without any table record', () => {
		expect(checkTablePutPermission(perm({ super_user: true }), 'data', 'dog')).toBe(true);
	});

	// `structure_user` short-circuits DDL, not DML, so it still needs the real grants for a write.
	it('does not let structure_user alone stand in for the grants', () => {
		expect(checkTablePutPermission(perm({ structure_user: true }), 'data', 'dog')).toBe(false);
	});

	it('allows a role holding both table flags when no allowlist is set', () => {
		expect(checkTablePutPermission(perm({ data: { tables: { dog: writable } } }), 'data', 'dog')).toBe(true);
	});

	// The case the previous gate got wrong in the restrictive direction. Harper authorizes `put` from
	// the `put` allowlist entry, NOT from `update`/`insert` entries, so this role is valid server-side.
	it("allows a role whose allowlist names only 'put'", () => {
		const permission = perm({ operations: ['put'], data: { tables: { dog: writable } } });
		expect(checkTablePutPermission(permission, 'data', 'dog')).toBe(true);
	});

	it("denies a role whose allowlist omits 'put', even with update and insert", () => {
		const permission = perm({ operations: ['update', 'insert'], data: { tables: { dog: writable } } });
		expect(checkTablePutPermission(permission, 'data', 'dog')).toBe(false);
	});

	it('denies when either table flag is missing', () => {
		const insertOnly = { ...writable, update: false };
		const updateOnly = { ...writable, insert: false };
		expect(checkTablePutPermission(perm({ data: { tables: { dog: insertOnly } } }), 'data', 'dog')).toBe(false);
		expect(checkTablePutPermission(perm({ data: { tables: { dog: updateOnly } } }), 'data', 'dog')).toBe(false);
	});

	// The case the previous gate got wrong in the permissive direction: the flags stay true, but Harper
	// refuses every `put` for an attribute-scoped role (PUT_WITH_ATTRIBUTE_PERMS), because a replace
	// drops attributes the request omits and the attribute check only sees what a request supplies.
	it('denies an attribute-scoped role even though the table flags are set', () => {
		const scoped = {
			...writable,
			attribute_permissions: [{ attribute_name: 'salary', read: true, insert: false, update: false }],
		};
		expect(checkTablePutPermission(perm({ data: { tables: { dog: scoped } } }), 'data', 'dog')).toBe(false);
	});

	// A translated v4 role spells the same scoping `attribute_restrictions`.
	it('denies a legacy role scoped with attribute_restrictions', () => {
		const legacy = {
			read: true,
			insert: true,
			update: true,
			delete: false,
			attribute_restrictions: [{ attribute_name: 'salary', read: true, insert: false, update: false }],
		};
		expect(checkTablePutPermission(perm({ data: { tables: { dog: legacy } } }), 'data', 'dog')).toBe(false);
	});

	it('allows a role whose attribute scoping list is present but empty', () => {
		const empty = { ...writable, attribute_permissions: [] };
		expect(checkTablePutPermission(perm({ data: { tables: { dog: empty } } }), 'data', 'dog')).toBe(true);
	});

	it('denies when the database or table has no entry', () => {
		expect(checkTablePutPermission(perm({ data: { tables: {} } }), 'data', 'dog')).toBe(false);
		expect(checkTablePutPermission(perm({}), 'data', 'dog')).toBe(false);
	});
});
