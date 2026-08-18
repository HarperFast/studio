import { LocalRolePermission } from '@/integrations/api/api.patch';
import {
	classifyOperationsValue,
	getDatabasePermissionRecord,
	getOperationsAllowlist,
	isUneditableOperationsValue,
	orderPermissionKeys,
	structureUserDdlScope,
	withOperations,
} from '@/integrations/api/localRolePermission';
import { describe, expect, it } from 'vitest';

const dogTable = { read: true, insert: false, update: false, delete: false, attribute_permissions: null };

describe('getDatabasePermissionRecord', () => {
	it('returns the record for a database key', () => {
		const permission: LocalRolePermission = { data: { tables: { dog: dogTable } } };
		expect(getDatabasePermissionRecord(permission, 'data', true)?.tables.dog).toBe(dogTable);
	});

	it('never treats flag keys as database records, whatever their value shape', () => {
		const permission = { super_user: true, structure_user: { tables: {} } } as unknown as LocalRolePermission;
		expect(getDatabasePermissionRecord(permission, 'super_user', true)).toBeUndefined();
		expect(getDatabasePermissionRecord(permission, 'structure_user', true)).toBeUndefined();
	});

	it('lets the instance version settle the operations key, not the value shape', () => {
		const record = { operations: { tables: { dog: dogTable } } } as unknown as LocalRolePermission;
		// Below the floor Harper reserved nothing by that name, so it is an ordinary database…
		expect(getDatabasePermissionRecord(record, 'operations', false)?.tables.dog).toBe(dogTable);
		// …and at or above it the key belongs to the allowlist, so it is never a table grant.
		expect(getDatabasePermissionRecord(record, 'operations', true)).toBeUndefined();

		const allowlist: LocalRolePermission = { operations: ['read_only'] };
		expect(getDatabasePermissionRecord(allowlist, 'operations', true)).toBeUndefined();
		expect(getDatabasePermissionRecord(allowlist, 'operations', false)).toBeUndefined();
	});

	it('agrees with classifyOperationsValue in both worlds', () => {
		// The module contract: these two must never disagree about what the key holds.
		const cases: LocalRolePermission[] = [
			{ operations: ['sql'] },
			{ operations: { tables: {} } } as unknown as LocalRolePermission,
			{ operations: {} } as unknown as LocalRolePermission,
			{ operations: true } as unknown as LocalRolePermission,
			{ operations: 'read_only' } as unknown as LocalRolePermission,
			{ operations: ['read_only', 42] } as unknown as LocalRolePermission,
		];
		for (const permission of cases) {
			// The shared claim is about what a *record* is, so it is asserted where both functions
			// speak about records: below the floor, `database` must mean exactly "a record is here".
			// Above it the verdicts diverge by design — `breaks-auth` also covers non-records like
			// `true`, which is why the biconditional is stated for the one reading they share.
			const isRecord = getDatabasePermissionRecord(permission, 'operations', false) !== undefined;
			expect(classifyOperationsValue(permission, false) === 'database').toBe(isRecord);
		}
	});

	it('returns undefined for null, array, and missing values', () => {
		const permission = { dev: null, other: ['x'] } as unknown as LocalRolePermission;
		expect(getDatabasePermissionRecord(permission, 'dev', true)).toBeUndefined();
		expect(getDatabasePermissionRecord(permission, 'other', true)).toBeUndefined();
		expect(getDatabasePermissionRecord(permission, 'missing', true)).toBeUndefined();
	});

	it('does not report inherited properties as a database record', () => {
		// Without an own-property check, `permission['__proto__']` yields Object.prototype.
		expect(getDatabasePermissionRecord({}, '__proto__', true)).toBeUndefined();
		expect(getDatabasePermissionRecord({}, 'toString', true)).toBeUndefined();
	});
});

describe('getOperationsAllowlist / isUneditableOperationsValue', () => {
	it('returns a well-formed allowlist and reports it as not malformed', () => {
		const permission: LocalRolePermission = { operations: ['read_only', 'deploy_component'] };
		expect(getOperationsAllowlist(permission)).toEqual(['read_only', 'deploy_component']);
		expect(isUneditableOperationsValue(permission, true)).toBe(false);
	});

	it('treats a non-array or mixed-type operations value as malformed, not partially valid', () => {
		const nonArray = { operations: true } as unknown as LocalRolePermission;
		expect(getOperationsAllowlist(nonArray)).toBeUndefined();
		expect(isUneditableOperationsValue(nonArray, true)).toBe(true);

		// Silently dropping the 42 on the next write would save an array the user never saw.
		const mixed = { operations: ['read_only', 42] } as unknown as LocalRolePermission;
		expect(getOperationsAllowlist(mixed)).toBeUndefined();
		expect(isUneditableOperationsValue(mixed, true)).toBe(true);
	});

	it('is quiet for roles without the key (and for missing permissions)', () => {
		expect(getOperationsAllowlist({})).toBeUndefined();
		expect(isUneditableOperationsValue({}, true)).toBe(false);
		expect(getOperationsAllowlist(undefined)).toBeUndefined();
		expect(isUneditableOperationsValue(undefined, true)).toBe(false);
	});
});

describe('classifyOperationsValue', () => {
	it('separates an allowlist from a pre-5.0 database named operations', () => {
		expect(classifyOperationsValue({ operations: ['sql'] }, true)).toBe('allowlist');
		// A v4 role granting a database called `operations` is valid, not something to "fix".
		const v4 = { operations: { tables: { dog: dogTable } } } as unknown as LocalRolePermission;
		expect(classifyOperationsValue(v4, false)).toBe('database');
		expect(isUneditableOperationsValue(v4, false)).toBe(false);
		// …but on a supporting instance the editor must not touch it.
		expect(classifyOperationsValue(v4, true)).toBe('breaks-auth');
		expect(isUneditableOperationsValue(v4, true)).toBe(true);
	});

	it('separates the upgrade collision from a plain database grant', () => {
		// Same value, two instances: above the floor it is an unmanageable collision the editor must
		// not overwrite, below it an ordinary database grant.
		const record = { operations: { tables: {} } } as unknown as LocalRolePermission;
		expect(classifyOperationsValue(record, true)).toBe('breaks-auth');
		expect(classifyOperationsValue(record, false)).toBe('database');
		expect(isUneditableOperationsValue(record, true)).toBe(true);
	});

	it('separates the fatal shapes from the merely invalid ones', () => {
		// Verified against harper's compiled expandOperationsPerms: only non-iterables throw during
		// the user-cache load. A string iterates per character and a mixed array iterates fine, so
		// neither takes authentication down — they just fail write-time validation.
		for (const fatal of [{ tables: {} }, true, 42]) {
			expect(classifyOperationsValue({ operations: fatal } as unknown as LocalRolePermission, true))
				.toBe('breaks-auth');
		}
		for (const invalid of ['read_only', ['read_only', 42], ['read_only', { a: 1 }]]) {
			expect(classifyOperationsValue({ operations: invalid } as unknown as LocalRolePermission, true))
				.toBe('malformed');
		}
	});

	it('calls every non-record value inert below the floor, including a well-formed allowlist', () => {
		// Pre-allowlist Harper has no gate, no expansion and no validation for the key, so nothing
		// there restricts or breaks — saying otherwise would tell an operator a role is locked down
		// when it is not.
		for (const value of [true, 42, 'read_only', ['read_only'], ['read_only', 42], false, null]) {
			const permission = { operations: value } as unknown as LocalRolePermission;
			expect(classifyOperationsValue(permission, false)).toBe('inert');
		}
		// …while a real table-permission record is still recognized as the database grant it is.
		expect(classifyOperationsValue({ operations: { tables: {} } } as unknown as LocalRolePermission, false))
			.toBe('database');
	});

	it('reserves the instance-wide warning for values the cache-load guard actually expands', () => {
		// cacheExpandedOperationsPerms returns early on a falsy value, so those never reach the
		// expansion that rejects listUsers — they fail per request instead.
		for (const truthy of [{ tables: {} }, true, 42]) {
			expect(classifyOperationsValue({ operations: truthy } as unknown as LocalRolePermission, true))
				.toBe('breaks-auth');
		}
		for (const falsy of [false, null, 0]) {
			expect(classifyOperationsValue({ operations: falsy } as unknown as LocalRolePermission, true))
				.toBe('malformed');
		}
	});

	it('reports absent and invalid values distinctly', () => {
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
