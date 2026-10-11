import {
	canonicalOperationName,
	expandEffectiveOperations,
	gateVerdict,
	getAvailableGroups,
	getGrantableOperations,
	getOperationInfo,
	GrantBand,
	isInertGrant,
	isOperationGroupName,
	OPERATION_CATALOG,
	OPERATION_CATEGORIES,
	OPERATION_GROUPS,
	resolveGrantBand,
	supportsOperationsAllowlist,
} from '@/features/instance/config/roles/operations/operationsCatalog';
import { describe, expect, it } from 'vitest';

describe('supportsOperationsAllowlist', () => {
	it('is off for pre-5.0 versions and missing versions', () => {
		expect(supportsOperationsAllowlist(undefined)).toBe(false);
		expect(supportsOperationsAllowlist('4.7.3')).toBe(false);
		expect(supportsOperationsAllowlist('2.0.000')).toBe(false);
	});

	it('is off for the 5.0 prereleases that predate the feature', () => {
		// permission.operations first ships in v5.0.0-alpha.8; earlier alphas take the key and fail.
		expect(supportsOperationsAllowlist('5.0.0-alpha.2')).toBe(false);
		expect(supportsOperationsAllowlist('5.0.0-alpha.7')).toBe(false);
	});

	it('is on from the release that introduced it', () => {
		expect(supportsOperationsAllowlist('5.0.0-alpha.8')).toBe(true);
		expect(supportsOperationsAllowlist('5.0.0')).toBe(true);
		expect(supportsOperationsAllowlist('5.2.2')).toBe(true);
	});
});

describe('OPERATION_CATALOG', () => {
	it('has unique names, known categories, and alias targets that exist', () => {
		const names = new Set<string>();
		for (const operation of OPERATION_CATALOG) {
			expect(names.has(operation.name)).toBe(false);
			names.add(operation.name);
			expect(OPERATION_CATEGORIES).toContain(operation.category);
			if (operation.aliasOf) {
				const canonical = getOperationInfo(operation.aliasOf);
				expect(canonical).toBeDefined();
				// The alias name is validated against the same authorization entry as its canonical
				// form, so the two must agree on the super_user flag.
				expect(canonical?.su).toBe(operation.su);
			}
		}
	});

	it('marks exactly the handler-enforced super_user operations as non-delegable', () => {
		const nonDelegable = OPERATION_CATALOG.filter((operation) => operation.nonDelegable).map((o) => o.name).sort();
		expect(nonDelegable).toEqual([
			'add_oidc_trust',
			'create_backup',
			'delete_backup',
			'delete_secret',
			'drop_oidc_trust',
			'get_deployment_payload',
			'get_secrets_public_key',
			'grant_secret',
			'list_backups',
			'list_oidc_trust',
			'list_secrets',
			'purge_backups',
			'restore_backup',
			'revoke_secret',
			'set_secret',
			'verify_backup',
		]);
		for (const name of nonDelegable) {
			expect(getOperationInfo(name)?.su).toBe(true);
		}
	});
});

describe('getGrantableOperations', () => {
	it('offers only 5.0-era operations to a 5.0 instance', () => {
		const names = getGrantableOperations('5.0.3').map((operation) => operation.name);
		expect(names).toContain('deploy_component');
		expect(names).toContain('get_status');
		expect(names).not.toContain('list_deployments'); // 5.1+
		expect(names).not.toContain('agent_prompt'); // 5.1+
		expect(names).not.toContain('set_env_value'); // 5.2+
	});

	it('adds 5.1 and 5.2 operations as the version allows, but never non-delegable ones', () => {
		const at51 = getGrantableOperations('5.1.26').map((operation) => operation.name);
		expect(at51).toContain('list_deployments');
		expect(at51).toContain('agent_prompt');
		expect(at51).not.toContain('get_deployment_payload'); // non-delegable
		expect(at51).not.toContain('set_env_value'); // 5.2+

		const at52 = getGrantableOperations('5.2.2').map((operation) => operation.name);
		expect(at52).toContain('set_env_value');
		expect(at52).not.toContain('set_secret'); // non-delegable
		expect(at52).not.toContain('create_backup'); // non-delegable
	});

	it("offers prerelease builds their own release's operations", () => {
		const names = getGrantableOperations('5.2.0-beta.1').map((operation) => operation.name);
		expect(names).toContain('set_env_value');
	});

	it('never offers what no allowlist can reach, including catchup once 5.3 stops matching it', () => {
		const at52 = getGrantableOperations('5.2.15').map((operation) => operation.name);
		expect(at52).toContain('catchup');
		expect(at52).not.toContain('get_backup');
		expect(at52).not.toContain('read_transaction_log');

		const at53 = getGrantableOperations('5.3.0').map((operation) => operation.name);
		expect(at53).not.toContain('catchup');
		expect(at53).not.toContain('get_backup');
		expect(at53).not.toContain('read_transaction_log');
	});

	it('offers the deploy operations on every 5.x, and the trust-policy operations on none', () => {
		for (const version of ['5.0.3', '5.2.15', '5.3.0']) {
			const names = getGrantableOperations(version).map((operation) => operation.name);
			expect(names, version).toContain('deploy_component');
			expect(names, version).not.toContain('add_oidc_trust');
			expect(names, version).not.toContain('list_oidc_trust');
			expect(names, version).not.toContain('drop_oidc_trust');
		}
	});

	it('offers drop_custom_function_project under its own name, and delete_records_before only through its canonical one', () => {
		// drop_custom_function_project has its own handler and grant name; delete_records_before
		// dispatches to delete_files_before's handler, which is granted by that name alone.
		const names = getGrantableOperations('5.3.0').map((operation) => operation.name);
		expect(names).toContain('drop_custom_function_project');
		expect(names).not.toContain('delete_records_before');
		expect(names).toContain('delete_files_before');
	});
});

describe('getAvailableGroups', () => {
	it('offers the three original groups before 5.2 and adds agent from 5.2', () => {
		expect(getAvailableGroups('5.0.0').map((group) => group.name)).toEqual([
			'read_only',
			'admin_read',
			'standard_user',
		]);
		expect(getAvailableGroups('5.2.0-alpha.4').map((group) => group.name)).toEqual([
			'read_only',
			'admin_read',
			'standard_user',
			'agent',
		]);
	});

	// Mirrors Harper's `OPERATION_PERMISSION_GROUPS.standard_user` (`utility/operationPermissions.ts`),
	// which lists put alongside the other data writes. A missing member makes Studio's
	// effective-operation summary deny a capability the server actually grants.
	it('includes every data write Harper puts in standard_user', () => {
		const standardUser = OPERATION_GROUPS.find((group) => group.name === 'standard_user');
		expect(standardUser?.members).toEqual(
			expect.arrayContaining(['insert', 'update', 'upsert', 'put', 'delete']),
		);
	});

	it('only names catalog operations as members', () => {
		for (const group of OPERATION_GROUPS) {
			for (const member of group.members) {
				expect(getOperationInfo(member), `${group.name} member ${member}`).toBeDefined();
			}
		}
	});
});

describe('expandEffectiveOperations', () => {
	it('expands read_only to its members, folding alias spellings into their canonical name', () => {
		// Harper's group lists both spellings of two alias pairs (describe_schema/describe_database,
		// search_by_hash/search_by_id), but each pair reaches one handler — counting both would
		// overstate the role's reach against the chips shown beside the count.
		expect(expandEffectiveOperations(['read_only'], '5.3')).toEqual([
			'describe_all',
			'describe_metric',
			'describe_schema',
			'describe_table',
			'get_analytics',
			'get_job',
			'list_metrics',
			'search',
			'search_by_conditions',
			'search_by_hash',
			'search_by_value',
			'user_info',
		]);
	});

	it('does not credit a directly granted alias with its canonical operation', () => {
		// The chip beside the count says an alias grant does nothing, so folding it here would have
		// the same component claiming access the server denies.
		expect(expandEffectiveOperations(['describe_database', 'search_by_id'], '5.3')).toEqual([]);
		expect(expandEffectiveOperations(['delete_records_before'], '5.3')).toEqual([]);
	});

	it('leaves out entries the allowlist does not govern', () => {
		// set_secret and the trust-policy operations self-enforce super_user; sql is authorized on its
		// own path, so listing any of them changes nothing about what the role can do.
		expect(expandEffectiveOperations(['set_secret', 'sql', 'add_oidc_trust', 'list_oidc_trust'], '5.3')).toEqual([]);
	});

	it('de-duplicates group members against explicit names and passes unknown names through', () => {
		const effective = expandEffectiveOperations(['read_only', 'search', 'my_component_op'], '5.3');
		expect(effective.filter((name) => name === 'search')).toHaveLength(1);
		// A component-registered name is unknown to the catalog, so it cannot be judged inert.
		expect(effective).toContain('my_component_op');
	});

	it('counts catchup only where the gate still matches its wire name', () => {
		// Registered under the bare string 'catchup', so the pre-5.3 fallback matched it; 5.3 names it null.
		expect(expandEffectiveOperations(['catchup'], 'pre-5.3')).toEqual(['catchup']);
		expect(expandEffectiveOperations(['catchup'], '5.3')).toEqual([]);
	});

	it('counts the deploy operations from 5.3 and not before', () => {
		const deployRole = ['deploy_component', 'get_job'];
		expect(expandEffectiveOperations(deployRole, 'pre-5.3')).toEqual(['get_job']);
		expect(expandEffectiveOperations(deployRole, '5.3')).toEqual(['deploy_component', 'get_job']);
	});

	it('never counts the operations Harper keeps out of every allowlist', () => {
		for (const band of ['pre-5.3', '5.3'] as const) {
			expect(expandEffectiveOperations(['get_backup', 'read_transaction_log'], band)).toEqual([]);
		}
	});

	it('expands an empty allowlist to nothing', () => {
		expect(expandEffectiveOperations([], '5.3')).toEqual([]);
	});
});

// Harper's own record of which names gate 1 grants by name (unitTests/utility/operation_authorization.test.js
// at v5.3.0, GRANTED_BY_NAME): the twenty entries that were unnamed before 5.3.
const NAMED_FROM_5_3 = [
	'add_component',
	'cleanup_orphan_blobs',
	'clear_status',
	'delete_audit_logs_before',
	'delete_files_before',
	'delete_transaction_logs_before',
	'deploy_component',
	'drop_component',
	'drop_custom_function',
	'drop_custom_function_project',
	'get_status',
	'install_node_modules',
	'package_component',
	'registration_info',
	'restart_service',
	'search_jobs_by_start_date',
	'set_component_file',
	'set_configuration',
	'set_custom_function',
	'set_status',
];

describe('resolveGrantBand', () => {
	it('puts the first build that names every entry, and everything after it, on the 5.3 side', () => {
		for (const version of ['5.3.0-beta.3', '5.3.0-beta.4', '5.3.0', '5.3.2', '5.4.0', '6.0.0']) {
			expect(resolveGrantBand(version), version).toBe('5.3');
		}
	});

	it('keeps the 5.3 prereleases that predate it, and every 5.2, on the old side', () => {
		for (const version of ['5.3.0-alpha.1', '5.3.0-beta.1', '5.3.0-beta.2', '5.2.15', '5.0.0']) {
			expect(resolveGrantBand(version), version).toBe('pre-5.3');
		}
	});

	it('falls back to the old side for a version it cannot read', () => {
		// The conservative side: a grant the UI calls inert can only under-promise.
		expect(resolveGrantBand('')).toBe('pre-5.3');
		expect(resolveGrantBand('not-a-version')).toBe('pre-5.3');
	});
});

describe('gateVerdict', () => {
	it('marks exactly the twenty newly named entries as needing 5.3', () => {
		const needs53 = OPERATION_CATALOG.filter((operation) => gateVerdict(operation.name, 'pre-5.3') === 'needs-5.3')
			.map((operation) => operation.name)
			.sort();
		expect(needs53).toEqual(NAMED_FROM_5_3);
		for (const name of NAMED_FROM_5_3) {
			expect(gateVerdict(name, '5.3'), name).toBe('grants');
		}
	});

	it('marks only get_backup and read_transaction_log as never granted on both sides, and catchup from 5.3', () => {
		const never = (band: GrantBand) =>
			OPERATION_CATALOG.filter((operation) => gateVerdict(operation.name, band) === 'never')
				.map((operation) => operation.name)
				.sort();
		expect(never('pre-5.3')).toEqual(['get_backup', 'read_transaction_log']);
		expect(never('5.3')).toEqual(['catchup', 'get_backup', 'read_transaction_log']);
	});

	it('does not judge a name the catalog does not know', () => {
		expect(gateVerdict('my_component_op', 'pre-5.3')).toBe('grants');
	});
});

describe('isInertGrant', () => {
	it('stops calling the deploy-only CI role inert on 5.3', () => {
		expect(isInertGrant('deploy_component', 'pre-5.3')).toBe(true);
		expect(isInertGrant('deploy_component', '5.3')).toBe(false);
	});
});

describe('canonicalOperationName', () => {
	it('collapses aliases onto their authorization entry and leaves everything else alone', () => {
		expect(canonicalOperationName('create_schema')).toBe('create_database');
		expect(canonicalOperationName('search_by_id')).toBe('search_by_hash');
		expect(canonicalOperationName('delete_records_before')).toBe('delete_files_before');
		expect(canonicalOperationName('drop_custom_function_project')).toBe('drop_custom_function_project');
		expect(canonicalOperationName('create_database')).toBe('create_database');
		expect(canonicalOperationName('my_component_op')).toBe('my_component_op');
	});
});

describe('isOperationGroupName', () => {
	it('recognizes groups and nothing else', () => {
		expect(isOperationGroupName('standard_user')).toBe(true);
		expect(isOperationGroupName('agent')).toBe(true);
		expect(isOperationGroupName('search')).toBe(false);
		expect(isOperationGroupName('super_user')).toBe(false);
	});
});
