import { LocalRolePermission } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import { checkSchemaTablePermission } from './checkSchemaTablePermission';

// The index-signature/boolean-flag shape of LocalRolePermission is awkward to build as a literal, so
// cast minimal stand-ins.
function perm(value: Record<string, unknown>): LocalRolePermission {
	return value as unknown as LocalRolePermission;
}

describe('checkSchemaTablePermission', () => {
	it('denies while the permission is still loading', () => {
		expect(checkSchemaTablePermission(undefined, 'data', 'dog', 'insert', true)).toBe(false);
	});

	it('allows super_user and structure_user regardless of the specific table', () => {
		expect(checkSchemaTablePermission(perm({ super_user: true }), 'data', 'dog', 'insert', true)).toBe(true);
		expect(checkSchemaTablePermission(perm({ structure_user: true }), 'data', 'dog', 'insert', true)).toBe(true);
	});

	// Regression: a restricted (non-structure_user) user whose database grant doesn't list the table
	// used to crash on `tables[tableName][action]` (missing optional chain) -- e.g. opening a table
	// context menu. It must simply deny.
	it('denies (without crashing) when the database has no entry for the table', () => {
		expect(checkSchemaTablePermission(perm({ data: { tables: {} } }), 'data', 'dog', 'insert', true)).toBe(false);
	});

	it('denies when the database itself is absent from the permission map', () => {
		expect(checkSchemaTablePermission(perm({ data: { tables: {} } }), 'other', 'dog', 'insert', true)).toBe(false);
	});

	it('reflects the per-action flag on a granted table', () => {
		const permission = perm({
			data: {
				tables: { dog: { read: true, insert: true, update: false, delete: false, attribute_permissions: null } },
			},
		});
		expect(checkSchemaTablePermission(permission, 'data', 'dog', 'insert', true)).toBe(true);
		expect(checkSchemaTablePermission(permission, 'data', 'dog', 'update', true)).toBe(false);
	});
});
