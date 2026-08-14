import { LocalRolePermission } from '@/integrations/api/api.patch';
import {
	getDatabasePermissionRecord,
	getOperationsAllowlist,
	hasMalformedOperations,
	orderPermissionKeys,
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
});

describe('getOperationsAllowlist / hasMalformedOperations', () => {
	it('returns a well-formed allowlist and reports it as not malformed', () => {
		const permission: LocalRolePermission = { operations: ['read_only', 'deploy_component'] };
		expect(getOperationsAllowlist(permission)).toEqual(['read_only', 'deploy_component']);
		expect(hasMalformedOperations(permission)).toBe(false);
	});

	it('treats a non-array or mixed-type operations value as malformed, not partially valid', () => {
		const nonArray = { operations: true } as unknown as LocalRolePermission;
		expect(getOperationsAllowlist(nonArray)).toBeUndefined();
		expect(hasMalformedOperations(nonArray)).toBe(true);

		// Silently dropping the 42 on the next write would save an array the user never saw.
		const mixed = { operations: ['read_only', 42] } as unknown as LocalRolePermission;
		expect(getOperationsAllowlist(mixed)).toBeUndefined();
		expect(hasMalformedOperations(mixed)).toBe(true);
	});

	it('is quiet for roles without the key (and for missing permissions)', () => {
		expect(getOperationsAllowlist({})).toBeUndefined();
		expect(hasMalformedOperations({})).toBe(false);
		expect(getOperationsAllowlist(undefined)).toBeUndefined();
		expect(hasMalformedOperations(undefined)).toBe(false);
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
