import { LocalRolePermission } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import { checkImportDataPermission, checkSchemaTablePermission } from './checkSchemaTablePermission';

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
