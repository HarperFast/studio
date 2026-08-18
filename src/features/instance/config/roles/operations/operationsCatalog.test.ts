import {
	expandEffectiveOperations,
	getAvailableGroups,
	getGrantableOperations,
	getOperationInfo,
	isOperationGroupName,
	OPERATION_CATALOG,
	OPERATION_CATEGORIES,
	OPERATION_GROUPS,
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
			'create_backup',
			'delete_backup',
			'delete_secret',
			'get_deployment_payload',
			'get_secrets_public_key',
			'grant_secret',
			'list_backups',
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
		expect(expandEffectiveOperations(['read_only'])).toEqual([
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
		expect(expandEffectiveOperations(['describe_database', 'search_by_id'])).toEqual([]);
	});

	it('leaves out entries the allowlist does not govern', () => {
		// set_secret self-enforces super_user; sql is authorized on its own path, so listing either
		// changes nothing about what the role can do.
		expect(expandEffectiveOperations(['set_secret', 'sql'])).toEqual([]);
	});

	it('de-duplicates group members against explicit names and passes unknown names through', () => {
		const effective = expandEffectiveOperations(['read_only', 'search', 'my_component_op']);
		expect(effective.filter((name) => name === 'search')).toHaveLength(1);
		// A component-registered name is unknown to the catalog, so it cannot be judged inert.
		expect(effective).toContain('my_component_op');
	});

	it('still counts an operation whose registration key already equals its wire name', () => {
		// catchup is registered under the bare string 'catchup', so the gate's `?? op` fallback lands
		// on the same name the grant carries — it matches, unlike the handler-name registrations.
		expect(expandEffectiveOperations(['catchup'])).toEqual(['catchup']);
	});

	it('does not count a grant the server cannot currently match', () => {
		// deploy_component's authorization entry omits api_name, so the chip calls it inert; counting
		// it here would have the same component claim access it denies.
		expect(expandEffectiveOperations(['deploy_component', 'get_status', 'delete_records_before'])).toEqual([]);
	});

	it('expands an empty allowlist to nothing', () => {
		expect(expandEffectiveOperations([])).toEqual([]);
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
