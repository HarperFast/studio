import { getOperationInfo, isOperationGroupName } from '@/features/instance/config/roles/operations/operationsCatalog';
import {
	checkAnyOperationAllowed,
	checkImportDataOperationsAllowed,
	checkTableActionAllowed,
	TABLE_ACTION_OPERATIONS,
} from '@/hooks/checkOperationPermission';
import { LocalRolePermission } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';

function perm(value: Record<string, unknown>): LocalRolePermission {
	return value as unknown as LocalRolePermission;
}

describe('checkAnyOperationAllowed', () => {
	it('restricts nothing when the role has no allowlist', () => {
		expect(checkAnyOperationAllowed(undefined, ['insert'])).toBe(true);
		expect(checkAnyOperationAllowed(perm({ structure_user: true }), ['insert'])).toBe(true);
	});

	it('restricts nothing when the allowlist is malformed', () => {
		expect(checkAnyOperationAllowed(perm({ operations: 'read_only' }), ['insert'])).toBe(true);
		expect(checkAnyOperationAllowed(perm({ operations: ['sql', 42] }), ['insert'])).toBe(true);
	});

	// What a pre-5.0 instance puts under this key is a database record, and permissionsTranslator
	// writes one there for any upgraded v4 role owning a database of that name. Only an array of
	// strings is an allowlist, so shape alone keeps those roles ungated -- no version lookup needed.
	it('reads a database record under `operations` as no allowlist at all', () => {
		const upgradedV4Role = perm({
			operations: { tables: { dog: { read: true, insert: true, update: true, delete: true } } },
		});
		expect(checkAnyOperationAllowed(upgradedV4Role, ['insert'])).toBe(true);
		expect(checkAnyOperationAllowed(upgradedV4Role, ['deploy_component'])).toBe(true);
	});

	it('denies everything on an empty allowlist, as the server does', () => {
		expect(checkAnyOperationAllowed(perm({ operations: [] }), ['insert'])).toBe(false);
	});

	it('allows a directly listed operation and denies unlisted ones', () => {
		const permission = perm({ operations: ['insert', 'update'] });
		expect(checkAnyOperationAllowed(permission, ['insert'])).toBe(true);
		expect(checkAnyOperationAllowed(permission, ['delete'])).toBe(false);
		expect(checkAnyOperationAllowed(permission, ['delete', 'update'])).toBe(true);
	});

	it('expands group names to their members', () => {
		const permission = perm({ operations: ['standard_user'] });
		expect(checkAnyOperationAllowed(permission, ['insert'])).toBe(true);
		expect(checkAnyOperationAllowed(permission, ['create_table'])).toBe(false);
	});

	it('lets a canonical entry cover operations checked under a legacy alias', () => {
		expect(checkAnyOperationAllowed(perm({ operations: ['search_by_hash'] }), ['search_by_id'])).toBe(true);
		expect(checkAnyOperationAllowed(perm({ operations: ['create_database'] }), ['create_schema'])).toBe(
			true,
		);
	});

	// The server stores allowlist entries verbatim but resolves the incoming operation to its
	// canonical api_name, so granting an alias grants nothing.
	it('treats a legacy alias inside the allowlist as a dead entry', () => {
		expect(checkAnyOperationAllowed(perm({ operations: ['search_by_id'] }), ['search_by_hash'])).toBe(
			false,
		);
		expect(checkAnyOperationAllowed(perm({ operations: ['create_schema'] }), ['create_database'])).toBe(
			false,
		);
	});

	it('matches unknown (component-registered) names verbatim', () => {
		const permission = perm({ operations: ['my_component_op'] });
		expect(checkAnyOperationAllowed(permission, ['my_component_op'])).toBe(true);
		expect(checkAnyOperationAllowed(permission, ['insert'])).toBe(false);
	});

	it('reuses the expansion for a repeated allowlist instance', () => {
		const operations = ['read_only'];
		expect(checkAnyOperationAllowed(perm({ operations }), ['sql'])).toBe(true);
		expect(checkAnyOperationAllowed(perm({ operations }), ['sql'])).toBe(true);
		expect(checkAnyOperationAllowed(perm({ operations }), ['insert'])).toBe(false);
	});
});

describe('operation mappings', () => {
	// Verbatim matching only works against canonical catalog entries; an alias or group name here
	// would silently never match.
	it('name only canonical, non-group catalog operations', () => {
		for (const name of [...Object.values(TABLE_ACTION_OPERATIONS).flat(), 'csv_data_load', 'csv_url_load', 'get_job']) {
			const info = getOperationInfo(name);
			expect(info, name).toBeDefined();
			expect(info?.aliasOf, name).toBeUndefined();
			expect(isOperationGroupName(name), name).toBe(false);
		}
	});

	it('maps each table action to the operation it issues', () => {
		expect(TABLE_ACTION_OPERATIONS.insert).toEqual(['insert']);
		expect(TABLE_ACTION_OPERATIONS.update).toEqual(['update']);
		expect(TABLE_ACTION_OPERATIONS.delete).toEqual(['delete']);
	});
});

describe('checkTableActionAllowed', () => {
	// verifyPerms clears a super_user before reaching the allowlist, so gating one would hide UI that
	// works.
	it('ignores the allowlist for a super_user', () => {
		expect(checkTableActionAllowed(perm({ super_user: true, operations: [] }), 'insert')).toBe(true);
		expect(checkTableActionAllowed(perm({ super_user: true, operations: ['read_only'] }), 'delete')).toBe(
			true,
		);
	});

	// isElevatedRole counts these two as well, because it answers a broader question. DML is where
	// they are still gated.
	it('still applies the allowlist to structure_user and cluster_user', () => {
		expect(checkTableActionAllowed(perm({ structure_user: true, operations: ['read_only'] }), 'insert'))
			.toBe(false);
		expect(checkTableActionAllowed(perm({ cluster_user: true, operations: ['read_only'] }), 'insert'))
			.toBe(false);
	});

	it('applies the allowlist per action', () => {
		const readOnly = perm({ operations: ['read_only'] });
		expect(checkTableActionAllowed(readOnly, 'read')).toBe(true);
		expect(checkTableActionAllowed(readOnly, 'insert')).toBe(false);
		expect(checkTableActionAllowed(readOnly, 'update')).toBe(false);
		expect(checkTableActionAllowed(readOnly, 'delete')).toBe(false);

		const standard = perm({ operations: ['standard_user'] });
		expect(checkTableActionAllowed(standard, 'insert')).toBe(true);
		expect(checkTableActionAllowed(standard, 'delete')).toBe(true);
	});

	// A bulk load is Import Data's operation, not Add Records'.
	it('does not accept a bulk load as an insert', () => {
		expect(checkTableActionAllowed(perm({ operations: ['csv_url_load'] }), 'insert')).toBe(false);
	});

	it('leaves roles without an allowlist untouched', () => {
		expect(checkTableActionAllowed(undefined, 'insert')).toBe(true);
		expect(checkTableActionAllowed(perm({ structure_user: true }), 'delete')).toBe(true);
	});
});

describe('checkImportDataOperationsAllowed', () => {
	it('accepts an insert grant, which the JSON-records source uses directly', () => {
		expect(checkImportDataOperationsAllowed(perm({ operations: ['insert'] }))).toBe(true);
	});

	// A CSV load returns a job id that the client then polls, so the load alone is a trap: the write
	// commits, the poll 403s, and the reported failure invites a duplicating retry.
	it('requires get_job alongside a CSV load', () => {
		expect(checkImportDataOperationsAllowed(perm({ operations: ['csv_url_load'] }))).toBe(false);
		expect(checkImportDataOperationsAllowed(perm({ operations: ['csv_url_load', 'get_job'] }))).toBe(true);
		expect(checkImportDataOperationsAllowed(perm({ operations: ['csv_data_load', 'get_job'] }))).toBe(true);
		// standard_user carries the loads and get_job (via read_only).
		expect(checkImportDataOperationsAllowed(perm({ operations: ['standard_user'] }))).toBe(true);
	});

	it('denies a read-only or empty allowlist, and ignores both for a super_user', () => {
		expect(checkImportDataOperationsAllowed(perm({ operations: ['read_only'] }))).toBe(false);
		expect(checkImportDataOperationsAllowed(perm({ structure_user: true, operations: [] }))).toBe(false);
		expect(checkImportDataOperationsAllowed(perm({ super_user: true, operations: [] }))).toBe(true);
	});

	it('restricts nothing without an allowlist', () => {
		expect(checkImportDataOperationsAllowed(undefined)).toBe(true);
		expect(checkImportDataOperationsAllowed(perm({ structure_user: true }))).toBe(true);
	});
});
