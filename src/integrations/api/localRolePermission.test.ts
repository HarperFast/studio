import { LocalRolePermission } from '@/integrations/api/api.patch';
import {
	classifyOperationsValue,
	getDatabasePermissionRecord,
	getOperationsAllowlist,
	hasMalformedOperations,
	orderPermissionKeys,
	structureUserDdlScope,
	withOperations,
} from '@/integrations/api/localRolePermission';
import { describe, expect, it } from 'vitest';

const dogTable = { read: true, insert: false, update: false, delete: false, attribute_permissions: null };

describe('getDatabasePermissionRecord', () => {
	it('returns the record for a database key', () => {
		const permission: LocalRolePermission = { data: { tables: { dog: dogTable } } };
		expect(getDatabasePermissionRecord(permission, 'data')?.tables.dog).toBe(dogTable);
	});

	it('never treats flag keys as database records, whatever their value shape', () => {
		const permission = { super_user: true, structure_user: { tables: {} } } as unknown as LocalRolePermission;
		expect(getDatabasePermissionRecord(permission, 'super_user')).toBeUndefined();
		expect(getDatabasePermissionRecord(permission, 'structure_user')).toBeUndefined();
	});

	it('disambiguates the operations key by shape: arrays are the 5.0+ allowlist, records are a v4 database', () => {
		// Pre-5.0 Harper reserved no `operations` field, so a v4 role can hold real table
		// permissions for a database with that name; an allowlist is never record-shaped.
		const v4Database = { operations: { tables: { dog: dogTable } } } as unknown as LocalRolePermission;
		expect(getDatabasePermissionRecord(v4Database, 'operations')?.tables.dog).toBe(dogTable);

		const allowlist: LocalRolePermission = { operations: ['read_only'] };
		expect(getDatabasePermissionRecord(allowlist, 'operations')).toBeUndefined();
	});

	it('returns undefined for null, array, and missing values', () => {
		const permission = { dev: null, other: ['x'] } as unknown as LocalRolePermission;
		expect(getDatabasePermissionRecord(permission, 'dev')).toBeUndefined();
		expect(getDatabasePermissionRecord(permission, 'other')).toBeUndefined();
		expect(getDatabasePermissionRecord(permission, 'missing')).toBeUndefined();
	});

	it('does not report inherited properties as a database record', () => {
		// Without an own-property check, `permission['__proto__']` yields Object.prototype.
		expect(getDatabasePermissionRecord({}, '__proto__')).toBeUndefined();
		expect(getDatabasePermissionRecord({}, 'toString')).toBeUndefined();
	});
});

describe('getOperationsAllowlist / hasMalformedOperations', () => {
	it('returns a well-formed allowlist and reports it as not malformed', () => {
		const permission: LocalRolePermission = { operations: ['read_only', 'deploy_component'] };
		expect(getOperationsAllowlist(permission)).toEqual(['read_only', 'deploy_component']);
		expect(hasMalformedOperations(permission, true)).toBe(false);
	});

	it('treats a non-array or mixed-type operations value as malformed, not partially valid', () => {
		const nonArray = { operations: true } as unknown as LocalRolePermission;
		expect(getOperationsAllowlist(nonArray)).toBeUndefined();
		expect(hasMalformedOperations(nonArray, true)).toBe(true);

		// Silently dropping the 42 on the next write would save an array the user never saw.
		const mixed = { operations: ['read_only', 42] } as unknown as LocalRolePermission;
		expect(getOperationsAllowlist(mixed)).toBeUndefined();
		expect(hasMalformedOperations(mixed, true)).toBe(true);
	});

	it('is quiet for roles without the key (and for missing permissions)', () => {
		expect(getOperationsAllowlist({})).toBeUndefined();
		expect(hasMalformedOperations({}, true)).toBe(false);
		expect(getOperationsAllowlist(undefined)).toBeUndefined();
		expect(hasMalformedOperations(undefined, true)).toBe(false);
	});
});

describe('classifyOperationsValue', () => {
	it('separates an allowlist from a pre-5.0 database named operations', () => {
		expect(classifyOperationsValue({ operations: ['sql'] }, true)).toBe('allowlist');
		// A v4 role granting a database called `operations` is valid, not something to "fix".
		const v4 = { operations: { tables: { dog: dogTable } } } as unknown as LocalRolePermission;
		expect(classifyOperationsValue(v4, false)).toBe('database');
		expect(hasMalformedOperations(v4, false)).toBe(false);
	});

	it('calls a record malformed on a supporting instance — role_validation rejects a non-array', () => {
		// The editor must not treat it as "unrestricted" there and overwrite it on the next click.
		const record = { operations: { tables: {} } } as unknown as LocalRolePermission;
		expect(classifyOperationsValue(record, true)).toBe('malformed');
		expect(classifyOperationsValue(record, false)).toBe('database');
	});

	it('still reports genuinely malformed values', () => {
		expect(classifyOperationsValue({ operations: true } as unknown as LocalRolePermission, true)).toBe('malformed');
		expect(classifyOperationsValue({ operations: ['sql', 42] } as unknown as LocalRolePermission, true))
			.toBe('malformed');
		expect(classifyOperationsValue({}, true)).toBe('absent');
	});
});

describe('structureUserDdlScope', () => {
	it('distinguishes the unscoped and database-scoped forms', () => {
		// Only the boolean form reaches create/drop database; the array form is scoped to its list.
		expect(structureUserDdlScope({ structure_user: true })).toBe(true);
		expect(structureUserDdlScope({ structure_user: ['dev'] })).toEqual(['dev']);
		expect(structureUserDdlScope({ structure_user: false })).toBe(false);
		expect(structureUserDdlScope({ structure_user: [] })).toBe(false);
		expect(structureUserDdlScope({})).toBe(false);
	});
});

describe('orderPermissionKeys / withOperations', () => {
	it('floats reserved keys to the top in canonical order, databases after in their order', () => {
		const permission: LocalRolePermission = {
			zebra: { tables: {} },
			operations: ['read_only'],
			alpha: { tables: {} },
			super_user: true,
		};
		expect(Object.keys(orderPermissionKeys(permission))).toEqual([
			'super_user',
			'operations',
			'zebra',
			'alpha',
		]);
	});

	it('sets, replaces, and removes the allowlist without mutating the input', () => {
		const permission: LocalRolePermission = { data: { tables: {} } };
		const withList = withOperations(permission, ['sql']);
		expect(Object.keys(withList)).toEqual(['operations', 'data']);
		expect(withList.operations).toEqual(['sql']);
		expect(permission.operations).toBeUndefined();

		const removed = withOperations(withList, undefined);
		expect(removed.operations).toBeUndefined();
		expect(Object.keys(removed)).toEqual(['data']);
	});
});
