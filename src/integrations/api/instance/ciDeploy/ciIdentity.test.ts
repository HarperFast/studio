// Ported from harper's unitTests/security/ciIdentity.test.js, so the two decide the same way.
import { OPERATION_GROUPS } from '@/features/instance/config/roles/operations/operationsCatalog';
import { describe, expect, it } from 'vitest';
import { planIdentityReconcile, policiesOverlap, policyDifferences, roleDifference, sameAuthority } from './ciIdentity';

const grant = {
	names: ['web-pr-*'],
	constraints: { isolated: true, hostSuffix: '.app.example.com', preview: 'required' },
};
const desiredRole = {
	role: 'web-ci-preview',
	permission: { super_user: false as const, operations: ['drop_component'], component_deploy: grant },
};
const policy = (id: string, environment: unknown) => ({
	id,
	issuer: 'https://token.actions.githubusercontent.com',
	audience: 'https://cluster.example.com:9925/',
	user: 'web-ci-preview',
	claims: {
		repository_id: '1',
		workflow_ref: 'a/web/.github/workflows/preview.yaml@refs/heads/main',
		environment,
	} as Record<string, unknown>,
	operations: ['drop_component'],
	description: 'x',
});
const withoutEnvironment = (claims: Record<string, unknown>) =>
	Object.fromEntries(Object.entries(claims).filter(([name]) => name !== 'environment'));

describe('roleDifference', () => {
	it('compares a component grant by its names as a set and its constraints exactly', () => {
		const stored = { role: 'web-ci-preview', permission: { ...desiredRole.permission } };
		expect(roleDifference(stored, desiredRole)).toBeUndefined();
		const widened = {
			...stored,
			permission: { ...stored.permission, component_deploy: { names: ['web-*'], constraints: grant.constraints } },
		};
		expect(roleDifference(widened, desiredRole)).toMatch(/component_deploy grant is/);
		const unbounded = { ...stored, permission: { ...stored.permission, component_deploy: { names: ['web-pr-*'] } } };
		expect(roleDifference(unbounded, desiredRole)).toMatch(/component_deploy grant is/);
		const { component_deploy: _grant, ...withoutGrant } = stored.permission;
		expect(roleDifference({ ...stored, permission: withoutGrant }, desiredRole)).toMatch(
			/component_deploy grant is null/,
		);
	});

	it("flags a grant on a role whose desired shape has none, the production deploy role's", () => {
		const production = {
			role: 'web-ci-deploy',
			permission: { super_user: false as const, operations: ['deploy_component'] },
		};
		const stored = { role: 'web-ci-deploy', permission: { ...production.permission, component_deploy: grant } };
		expect(roleDifference(stored, production)).toMatch(/component_deploy grant is/);
	});
});

it('plans each policy of the identity on its own', () => {
	const plan = planIdentityReconcile(
		{
			roles: [],
			users: [],
			policies: [{ ...policy('p1', 'preview'), enabled: true }, { ...policy('p2', 'x'), enabled: true }],
		},
		{
			role: desiredRole,
			user: { username: 'web-ci-preview', role: 'web-ci-preview' },
			policies: [policy('p1', 'preview'), policy('p2', 'preview-cleanup')] as never,
		},
		(id) => `drop ${id}`,
	);
	expect(plan.policies).toEqual(['keep', 'keep']);
	expect(plan.conflicts).toHaveLength(1);
	expect(plan.conflicts[0]).toMatch(/Trust policy "p2" already exists and claim environment is "x".*drop p2$/);
});

describe('sameAuthority', () => {
	it('compares the user, and the operations as a set, with no scope apart from every scope', () => {
		expect(sameAuthority({ user: 'a', operations: ['x', 'y'] }, { user: 'a', operations: ['y', 'x', 'y'] })).toBe(
			true,
		);
		expect(sameAuthority({ user: 'a' }, { user: 'a', operations: null })).toBe(true);
		expect(sameAuthority({ user: 'a' }, { user: 'a', operations: [] })).toBe(false);
		expect(sameAuthority({ user: 'a', operations: ['x'] }, { user: 'a', operations: ['x', 'y'] })).toBe(false);
		expect(sameAuthority({ user: 'a', operations: ['x'] }, { user: 'b', operations: ['x'] })).toBe(false);
	});

	it('reads a permission group as the operations it stands for, as authorization does', () => {
		const reads = [...(OPERATION_GROUPS.find((group) => group.name === 'read_only')?.members ?? [])];
		expect(reads.length).toBeGreaterThan(0);
		expect(sameAuthority({ user: 'a', operations: ['read_only'] }, { user: 'a', operations: reads })).toBe(true);
		expect(
			sameAuthority({ user: 'a', operations: ['read_only', reads[0]] }, { user: 'a', operations: ['read_only'] }),
		).toBe(true);
		expect(sameAuthority({ user: 'a', operations: ['read_only'] }, { user: 'a', operations: ['standard_user'] })).toBe(
			false,
		);
		expect(sameAuthority({ user: 'a', operations: ['read_only'] }, { user: 'a', operations: reads.slice(1) })).toBe(
			false,
		);
	});

	it('lets policyDifferences read reordered or repeated operations as the same', () => {
		const stored = { issuer: 'i', audience: 'a', user: 'u', claims: {}, operations: ['x', 'y'], id: 'p' };
		const desired = { ...stored, description: '' };
		expect(policyDifferences({ ...stored, operations: ['y', 'x', 'x'] }, desired)).toEqual([]);
	});
});

describe('policiesOverlap', () => {
	it('holds when every claim both constrain accepts a common value, scalar or list', () => {
		expect(policiesOverlap(policy('a', 'preview'), policy('b', 'preview'))).toBe(true);
		expect(policiesOverlap(policy('a', 'preview'), policy('b', ['staging', 'preview']))).toBe(true);
		const looser = { ...policy('c', 'x'), claims: withoutEnvironment(policy('c', 'x').claims) };
		expect(policiesOverlap(policy('a', 'preview'), looser)).toBe(true);
	});

	it('does not hold across environments, audiences or issuers', () => {
		expect(policiesOverlap(policy('a', 'preview'), policy('b', 'preview-cleanup'))).toBe(false);
		expect(policiesOverlap(policy('a', 'preview'), { ...policy('b', 'preview'), audience: 'https://other:9925/' }))
			.toBe(false);
		expect(policiesOverlap(policy('a', 'preview'), { ...policy('b', 'preview'), issuer: 'https://other' })).toBe(
			false,
		);
	});

	it('holds across audiences for an issuer whose token can name several', () => {
		const generic = (id: string, audience: string) => ({
			...policy(id, 'preview'),
			issuer: 'https://issuer.example.com',
			audience,
		});
		const one = generic('a', 'https://one.example.com');
		const two = generic('b', 'https://two.example.com');
		expect(policiesOverlap(one, two)).toBe(true);
		const pinned = { ...one, claims: { ...one.claims, aud: 'https://one.example.com' } };
		expect(policiesOverlap(pinned, two)).toBe(false);
		expect(policiesOverlap(two, pinned)).toBe(false);
	});

	it('does not hold between a GitHub policy that leaves event_name open and one only for pull_request_target', () => {
		const open = withoutEnvironment(policy('a', 'x').claims);
		const withEvent = (id: string, event_name: unknown) => ({ ...policy(id, 'x'), claims: { ...open, event_name } });
		const deploy = { ...policy('a', 'x'), claims: open };
		expect(policiesOverlap(deploy, withEvent('b', 'pull_request_target'))).toBe(false);
		expect(policiesOverlap(withEvent('b', ['pull_request_target']), deploy)).toBe(false);
		expect(policiesOverlap(deploy, withEvent('b', ['pull_request_target', 'push']))).toBe(true);
		expect(policiesOverlap(withEvent('a', 'pull_request_target'), withEvent('b', 'pull_request_target'))).toBe(true);
		const generic = (claims: Record<string, unknown>) => ({
			...policy('g', 'x'),
			issuer: 'https://issuer.example.com',
			claims,
		});
		expect(policiesOverlap(generic(open), generic({ ...open, event_name: 'pull_request_target' }))).toBe(true);
	});
});
