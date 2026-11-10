import type { AxiosInstance } from 'axios';
import { AxiosError } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import {
	canonicalCiDeployWorkflow,
	CI_DEPLOY_OPERATIONS,
	ciDeployNames,
	CiDeploySetupError,
	ciDeploySetupUnanswered,
	ciDeploySourceOf,
	desiredCiDeployRecords,
	isCiDeployBranch,
	isCiDeployEnvironment,
	planCiDeploy,
	setUpCiDeploy,
	supportsCiDeploy,
} from './ciDeploy';

const AUDIENCE = 'https://cluster.example.com:9925/';
const SOURCE = {
	repositoryId: '67890',
	repository: 'Acme/web',
	workflow: '.github/workflows/deploy.yaml',
	branch: 'main',
	environment: 'production',
};

const desired = () =>
	desiredCiDeployRecords({ app: 'web', names: ciDeployNames('web')!, audience: AUDIENCE, source: SOURCE });

const matchingRole = () => ({ id: 'web-ci-deploy', role: 'web-ci-deploy', permission: desired().role.permission });
const matchingUser = () => ({ username: 'web-ci-deploy', active: true, role: { role: 'web-ci-deploy' } });
const matchingPolicy = () => ({ ...desired().policy, enabled: true });

describe('supportsCiDeploy', () => {
	it('starts at 5.3.0-beta.3, the first build whose allowlist can grant deploy_component', () => {
		expect(supportsCiDeploy(undefined)).toBe(false);
		expect(supportsCiDeploy('5.3.0-beta.2')).toBe(false);
		expect(supportsCiDeploy('5.3.0-beta.3')).toBe(true);
		expect(supportsCiDeploy('5.3.4')).toBe(true);
		expect(supportsCiDeploy('5.4.0-alpha.2')).toBe(true);
	});
});

describe('names and inputs', () => {
	it("are the CLI's: role and user <app>-ci-deploy, policy github-actions-<app>", () => {
		expect(ciDeployNames('web')).toEqual({
			role: 'web-ci-deploy',
			user: 'web-ci-deploy',
			policy: 'github-actions-web',
		});
		expect(ciDeployNames('has space')).toBeUndefined();
		expect(ciDeployNames('x'.repeat(114))).toBeUndefined();
	});

	it('writes the four operations the CLI grants, and no component_deploy grant', () => {
		expect(CI_DEPLOY_OPERATIONS).toEqual(['deploy_component', 'get_deployment', 'get_job', 'registration_info']);
		const { role, policy } = desired();
		expect(role.permission).toEqual({ super_user: false, operations: CI_DEPLOY_OPERATIONS });
		expect(policy).toEqual({
			id: 'github-actions-web',
			issuer: 'https://token.actions.githubusercontent.com',
			audience: AUDIENCE,
			user: 'web-ci-deploy',
			claims: {
				repository_id: '67890',
				workflow_ref: 'Acme/web/.github/workflows/deploy.yaml@refs/heads/main',
				environment: 'production',
			},
			operations: CI_DEPLOY_OPERATIONS,
			description: 'GitHub Actions deploys of web from Acme/web (.github/workflows/deploy.yaml on main)',
		});
	});

	it('reads the source back from a stored policy, and nothing from one of another shape', () => {
		expect(ciDeploySourceOf(matchingPolicy())).toEqual(SOURCE);
		const nested = {
			claims: {
				...SOURCE,
				repository_id: '1',
				workflow_ref: 'a/b/.github/workflows/d.yml@refs/heads/release/1.0',
				environment: 'prod',
			},
		};
		expect(ciDeploySourceOf(nested)).toMatchObject({ branch: 'release/1.0', workflow: '.github/workflows/d.yml' });
		expect(ciDeploySourceOf({ claims: { repository_id: '1', workflow_path: 'a/b/x', environment: 'p' } }))
			.toBeUndefined();
		expect(ciDeploySourceOf({ claims: { ...matchingPolicy().claims, repository_id: 1 } })).toBeUndefined();
	});

	it("reads nothing from a policy whose names it wouldn't write into a workflow itself", () => {
		const claims = matchingPolicy().claims;
		for (
			const changed of [
				{ workflow_ref: "Acme/web/.github/workflows/deploy.yaml@refs/heads/main' || true || '" },
				{ workflow_ref: "Acme/web/.github/workflows/deploy.yaml@refs/heads/it's" },
				{ workflow_ref: 'Acme/w"eb/.github/workflows/deploy.yaml@refs/heads/main' },
				{ workflow_ref: 'Acme/web/.github/workflows/de ploy.yaml@refs/heads/main' },
				{ environment: '' },
				{ environment: 'prod: true' },
				{ repository_id: '012' },
			]
		) {
			expect(ciDeploySourceOf({ claims: { ...claims, ...changed } }), JSON.stringify(changed)).toBeUndefined();
		}
	});

	it('normalizes a workflow path to what workflow_ref names, and refuses one GitHub never runs', () => {
		expect(canonicalCiDeployWorkflow('./.github/workflows/deploy.yml')).toBe('.github/workflows/deploy.yml');
		expect(canonicalCiDeployWorkflow('.github\\workflows\\deploy.yaml')).toBe('.github/workflows/deploy.yaml');
		for (const path of ['deploy.yaml', '.github/workflows/ci/deploy.yaml', '.github/workflows/deploy.json']) {
			expect(canonicalCiDeployWorkflow(path), path).toBeUndefined();
		}
	});

	it('takes only branch and environment names that are safe to write into the workflow', () => {
		for (const branch of ['main', 'release/1.0', 'feature/a_b-c', 'x/HEAD', 'a.lock.b']) {
			expect(isCiDeployBranch(branch), branch).toBe(true);
		}
		for (
			const branch of ["it's", 'a b', 'a:b', '-x', '/x', 'x/', 'a//b', 'a..b', 'x.lock', 'x.lock/y', 'HEAD', 'a/.b', '']
		) {
			expect(isCiDeployBranch(branch), branch).toBe(false);
		}
		expect(isCiDeployEnvironment('production')).toBe(true);
		expect(isCiDeployEnvironment('prod "1"')).toBe(false);
	});
});

// Ported from harper's unitTests/bin/deploySetupGithubActions.test.js (`planReconcile`).
describe('planCiDeploy', () => {
	it('creates everything on an empty cluster', () => {
		expect(planCiDeploy({ roles: [], users: [], policies: [] }, desired())).toEqual({
			role: 'create',
			user: 'create',
			policy: 'create',
			conflicts: [],
		});
	});

	it('keeps records that already match, so a rerun changes nothing', () => {
		const plan = planCiDeploy(
			{ roles: [matchingRole()], users: [matchingUser()], policies: [matchingPolicy()] },
			desired(),
		);
		expect(plan).toEqual({ role: 'keep', user: 'keep', policy: 'keep', conflicts: [] });
	});

	it('keeps a role listing the operations in another order', () => {
		const role = {
			...matchingRole(),
			permission: { super_user: false, operations: [...CI_DEPLOY_OPERATIONS].reverse() },
		};
		expect(planCiDeploy({ roles: [role], users: [], policies: [] }, desired()).conflicts).toEqual([]);
	});

	it('finishes a partial setup: creates only what is missing', () => {
		const plan = planCiDeploy({ roles: [matchingRole()], users: [], policies: [] }, desired());
		expect(plan).toEqual({ role: 'keep', user: 'create', policy: 'create', conflicts: [] });
	});

	it('refuses a role with a component_deploy grant, which a later CLI run would refuse too', () => {
		const role = {
			...matchingRole(),
			permission: { ...matchingRole().permission, component_deploy: { names: ['web'] } },
		};
		expect(planCiDeploy({ roles: [role], users: [], policies: [] }, desired()).conflicts[0]).toMatch(
			/^Role "web-ci-deploy" already exists and its component_deploy grant is/,
		);
	});

	it('refuses every difference at once, and says how to replace a policy', () => {
		const plan = planCiDeploy(
			{
				roles: [{ ...matchingRole(), permission: { super_user: true } }],
				users: [{ ...matchingUser(), active: false }],
				policies: [{ ...matchingPolicy(), audience: 'https://other.example.com:9925/' }],
			},
			desired(),
		);
		expect(plan.conflicts).toEqual([
			'Role "web-ci-deploy" already exists and it is a super_user role.',
			'User "web-ci-deploy" already exists and it is inactive.',
			'Trust policy "github-actions-web" already exists and audience is "https://other.example.com:9925/", not '
			+ '"https://cluster.example.com:9925/". To replace it, drop it on the Trust Policies page and set this up again.',
		]);
	});

	it('refuses a disabled policy, so setup cannot quietly undo a revocation', () => {
		const plan = planCiDeploy({ roles: [], users: [], policies: [{ ...matchingPolicy(), enabled: false }] }, desired());
		expect(plan.conflicts[0]).toMatch(/already exists and it is disabled\./);
	});

	it("refuses a policy another application's policy would make the exchange refuse", () => {
		const api = { ...matchingPolicy(), id: 'github-actions-api', user: 'api-ci-deploy' };
		const plan = planCiDeploy({ roles: [], users: [], policies: [api] }, desired());
		expect(plan.conflicts.join()).toMatch(
			/Trust policy "github-actions-api", for user "api-ci-deploy", can match the same runs/,
		);
		for (const skipped of [{ enabled: false }, { exchangeable: false }]) {
			expect(planCiDeploy({ roles: [], users: [], policies: [{ ...api, ...skipped }] }, desired()).conflicts).toEqual(
				[],
			);
		}
		const deleted = { ...api, exchangeable: true, invalid_reason: "names user 'api-ci-deploy', which does not exist" };
		expect(planCiDeploy({ roles: [], users: [], policies: [deleted] }, desired()).conflicts).toHaveLength(1);
		const otherEnvironment = { ...api, claims: { ...api.claims, environment: 'staging' } };
		expect(planCiDeploy({ roles: [], users: [], policies: [otherEnvironment] }, desired()).conflicts).toEqual([]);
	});
});

type Handler = (body: Record<string, unknown>) => unknown;

/** A cluster that answers list operations from `state` and records writes into it, as Harper would. */
function fakeCluster(
	state: { roles: unknown[]; users: unknown[]; policies: unknown[] },
	overrides: Record<string, Handler> = {},
) {
	const post = vi.fn(async (_url: string, body: Record<string, unknown>) => {
		const override = overrides[body.operation as string];
		if (override) {
			return { data: await override(body) };
		}
		switch (body.operation) {
			case 'list_oidc_trust':
				return { data: { policies: state.policies } };
			case 'list_roles':
				return { data: state.roles };
			case 'list_users':
				return { data: state.users };
			case 'add_role': {
				const { operation: _operation, ...role } = body;
				state.roles.push(role);
				return { data: role };
			}
			case 'add_user': {
				const { operation: _operation, password: _password, ...user } = body;
				state.users.push({ ...user, role: { role: user.role } });
				return { data: { message: 'added' } };
			}
			case 'add_oidc_trust': {
				const { operation: _operation, ...policy } = body;
				state.policies.push({ ...policy, enabled: true });
				return { data: { message: 'set' } };
			}
		}
		throw new Error(`unexpected ${body.operation}`);
	});
	return { post, instanceClient: { post } as unknown as AxiosInstance };
}

const writes = (post: ReturnType<typeof vi.fn>) =>
	post.mock.calls.map(([, body]) => (body as { operation: string }).operation).filter((op) => !op.startsWith('list_'));

describe('setUpCiDeploy', () => {
	it("creates the role, the user and the policy in the CLI's order, then verifies the policy", async () => {
		const state = { roles: [], users: [], policies: [] };
		const { post, instanceClient } = fakeCluster(state);
		const result = await setUpCiDeploy({ instanceClient, desired: desired() });
		expect(writes(post)).toEqual(['add_role', 'add_user', 'add_oidc_trust']);
		expect(result.created).toEqual(['role web-ci-deploy', 'user web-ci-deploy', 'trust policy github-actions-web']);
		expect(result.policy).toMatchObject({ id: 'github-actions-web', audience: AUDIENCE });

		const addUser = post.mock.calls.find(([, body]) => body.operation === 'add_user')?.[1];
		expect(addUser).toMatchObject({ username: 'web-ci-deploy', role: 'web-ci-deploy', active: true });
		expect(addUser?.password).toMatch(/^[A-Za-z0-9_-]{43}$/);
		const addPolicy = post.mock.calls.find(([, body]) => body.operation === 'add_oidc_trust')?.[1];
		expect(addPolicy).toEqual({ operation: 'add_oidc_trust', ...desired().policy });
	});

	it('writes nothing when everything already matches', async () => {
		const state = { roles: [matchingRole()], users: [matchingUser()], policies: [matchingPolicy()] };
		const { post, instanceClient } = fakeCluster(state);
		expect((await setUpCiDeploy({ instanceClient, desired: desired() })).created).toEqual([]);
		expect(writes(post)).toEqual([]);
	});

	it('refuses before writing anything when a record differs', async () => {
		const state = { roles: [{ ...matchingRole(), permission: { super_user: true } }], users: [], policies: [] };
		const { post, instanceClient } = fakeCluster(state);
		const error = await setUpCiDeploy({ instanceClient, desired: desired() }).catch((caught) => caught);
		expect(error).toBeInstanceOf(CiDeploySetupError);
		expect(error).toMatchObject({ kind: 'refused', created: [] });
		expect(writes(post)).toEqual([]);
	});

	it('refuses to write a policy someone created while it ran', async () => {
		const state = { roles: [], users: [], policies: [] as unknown[] };
		let reads = 0;
		const { post, instanceClient } = fakeCluster(state, {
			list_oidc_trust: () => ({ policies: reads++ === 0 ? [] : [matchingPolicy()] }),
		});
		const error = await setUpCiDeploy({ instanceClient, desired: desired() }).catch((caught) => caught);
		expect(error).toMatchObject({ kind: 'refused', created: ['role web-ci-deploy', 'user web-ci-deploy'] });
		expect(error.problems[0]).toMatch(/was created while setup ran/);
		expect(writes(post)).toEqual(['add_role', 'add_user']);
	});

	it('shows the warning add_oidc_trust answers with', async () => {
		const { instanceClient } = fakeCluster({ roles: [matchingRole()], users: [matchingUser()], policies: [] }, {
			add_oidc_trust: () => ({ message: 'set', warning: "Policy 'x' authenticates as a super_user." }),
			list_oidc_trust: (() => {
				let reads = 0;
				return () => ({ policies: reads++ < 2 ? [] : [matchingPolicy()] });
			})(),
		});
		expect((await setUpCiDeploy({ instanceClient, desired: desired() })).warning).toBe(
			"Policy 'x' authenticates as a super_user.",
		);
	});

	it('fails verification on a policy that reads back differently, or that the exchange marks invalid', async () => {
		for (
			const stored of [
				{ ...matchingPolicy(), claims: { ...matchingPolicy().claims, environment: 'staging' } },
				{ ...matchingPolicy(), invalid_reason: "names inactive user 'web-ci-deploy'" },
			]
		) {
			let reads = 0;
			const { instanceClient } = fakeCluster({ roles: [matchingRole()], users: [matchingUser()], policies: [] }, {
				list_oidc_trust: () => ({ policies: reads++ < 2 ? [] : [stored] }),
			});
			const error = await setUpCiDeploy({ instanceClient, desired: desired() }).catch((caught) => caught);
			expect(error).toMatchObject({ kind: 'unverified', created: ['trust policy github-actions-web'] });
			expect(error.message).toMatch(
				/^Trust policy "github-actions-web" did not verify: (claim environment|names inactive)/,
			);
		}
	});

	it('says what it created before a call failed, and whether that call may have gone through', async () => {
		const timeout = new AxiosError(
			'timeout',
			AxiosError.ECONNABORTED,
			{ method: 'post', data: '{"operation":"add_user"}' } as never,
		);
		const { instanceClient } = fakeCluster({ roles: [], users: [], policies: [] }, {
			add_user: () => {
				throw timeout;
			},
		});
		const error = await setUpCiDeploy({ instanceClient, desired: desired() }).catch((caught) => caught);
		expect(error).toMatchObject({ kind: 'failed', created: ['role web-ci-deploy'] });
		expect(error.cause).toBe(timeout);
		expect(ciDeploySetupUnanswered(error)).toBe(true);
	});
});
