/**
 * Deploy from GitHub: the role, user and trust policy a GitHub Actions workflow deploys an application
 * with, using its OIDC token and no stored credential. Studio makes the same records, with the same names, as `harper
 * deploy setup=true provider=github-actions` (harper `bin/deploySetupGithubActions.ts`), calling the cluster as the
 * signed-in super user, so a project set up by either reads as set up to the other. Why it only creates is in
 * `ciIdentity.ts`; the design notes are in `features/instance/config/deployFromGitHub/DESIGN.md`.
 */
import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { OidcTrustPolicy } from '@/integrations/api/instance/oidcTrust/oidcTrust';
import { isUnansweredWrite } from '@/integrations/api/unansweredWrite';
import { parseGitHubRepository } from '@/integrations/github/lookUpGitHubRepository';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';
import { useMutation } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import {
	DesiredPolicy,
	DesiredRole,
	DesiredUser,
	GITHUB_ACTIONS_ISSUER,
	planIdentityReconcile,
	policiesOverlap,
	policyDifferences,
	Reconcile,
	sameAuthority,
} from './ciIdentity';

/**
 * Before 5.3.0-beta.3 the operations allowlist matched `deploy_component` and `registration_info` against handler names
 * that never equal a grant (harper#2175), so the role could not deploy. The trust operations themselves are older.
 */
export const CI_DEPLOY_MIN_VERSION = '5.3.0-beta.3';

export function supportsCiDeploy(version: string | undefined): boolean {
	return !!version && wasAReleasedBeforeB(CI_DEPLOY_MIN_VERSION, version);
}

/**
 * harper's `CI_DEPLOY_OPERATIONS`. `get_deployment` is how a rolling deploy waits for the other nodes, and
 * `registration_info` is the CLI's version check. There is deliberately no `component_deploy` grant: the CLI writes
 * none, and its `roleDifference` would then refuse a role that has one.
 */
export const CI_DEPLOY_OPERATIONS = ['deploy_component', 'get_deployment', 'get_job', 'registration_info'];
export const DEFAULT_CI_DEPLOY_WORKFLOW = '.github/workflows/deploy.yaml';
export const DEFAULT_CI_DEPLOY_BRANCH = 'main';
export const DEFAULT_CI_DEPLOY_ENVIRONMENT = 'production';
/** The repository variable the workflow reads its target from, which is also the policy's audience. */
export const CI_DEPLOY_TARGET_VARIABLE = 'HARPER_CLI_TARGET';

const APPLICATION_PATTERN = /^[A-Za-z0-9_-]+$/;
// add_oidc_trust's id grammar (harper `security/authn/oidc/trustPolicyOperations.ts`).
const POLICY_ID_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;
/**
 * Narrower than git allows, because the branch and environment are written into the workflow and its `if:`: these
 * characters can't end a YAML value or a GitHub expression's string, and cover the names people use. Still no name
 * git refuses (`git check-ref-format --branch`): not `HEAD`, nor any component ending in `.lock`.
 */
const BRANCH_PATTERN = /^(?!HEAD$)(?![-/.]|.*(?:\/\/|\/\.|\.\.|\/$|\.lock(?:\/|$)|\.$))[A-Za-z0-9._/-]{1,255}$/;
const ENVIRONMENT_PATTERN = /^[A-Za-z0-9._-]{1,255}$/;
const WORKFLOW_PATTERN = /^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/;
const WORKFLOW_REF_PATTERN = /^([^/]+\/[^/]+)\/(\.github\/workflows\/[^/@]+)@refs\/heads\/(.+)$/;

export interface CiDeployNames {
	role: string;
	user: string;
	policy: string;
}

/** harper's `deriveCiNames`. Undefined for a name no component can have, or whose policy id is too long. */
export function ciDeployNames(app: string): CiDeployNames | undefined {
	if (!APPLICATION_PATTERN.test(app)) {
		return undefined;
	}
	const names = { role: `${app}-ci-deploy`, user: `${app}-ci-deploy`, policy: `github-actions-${app}` };
	return POLICY_ID_PATTERN.test(names.policy) ? names : undefined;
}

export function isCiDeployBranch(branch: string): boolean {
	return BRANCH_PATTERN.test(branch);
}

export function isCiDeployEnvironment(environment: string): boolean {
	return ENVIRONMENT_PATTERN.test(environment);
}

/** The repository-relative path a `workflow_ref` names, as the CLI's `canonicalWorkflowPath` writes it. */
export function canonicalCiDeployWorkflow(workflow: string): string | undefined {
	const path = workflow.trim().replaceAll('\\', '/').replace(/^\.\//, '');
	return WORKFLOW_PATTERN.test(path) ? path : undefined;
}

function buildWorkflowRef(repository: string, workflow: string, branch: string): string {
	return `${repository}/${workflow}@refs/heads/${branch}`;
}

export interface CiDeploySource {
	repositoryId: string;
	/** GitHub's spelling, which `workflow_ref` carries byte for byte. */
	repository: string;
	workflow: string;
	branch: string;
	environment: string;
}

/**
 * The source a stored policy pins, read back from its claims. Undefined for a policy of another shape, and for one whose
 * names Studio would not write itself: the page builds the workflow from them, so a branch the CLI took with a quote in
 * it must not reach the `if:` of a job that holds `id-token: write`.
 */
export function ciDeploySourceOf(policy: { claims?: Record<string, unknown> }): CiDeploySource | undefined {
	const { repository_id: repositoryId, workflow_ref: workflowRef, environment } = policy.claims ?? {};
	const match = typeof workflowRef === 'string' ? WORKFLOW_REF_PATTERN.exec(workflowRef) : null;
	if (!match || typeof repositoryId !== 'string' || !/^[1-9]\d*$/.test(repositoryId)) {
		return undefined;
	}
	const [, repository, workflow, branch] = match;
	const writable = parseGitHubRepository(repository) === repository
		&& canonicalCiDeployWorkflow(workflow) === workflow
		&& isCiDeployBranch(branch)
		&& typeof environment === 'string'
		&& isCiDeployEnvironment(environment);
	return writable ? { repositoryId, repository, workflow, branch, environment } : undefined;
}

export interface CiDeployRecords {
	names: CiDeployNames;
	role: DesiredRole;
	user: DesiredUser;
	policy: DesiredPolicy;
}

/** What setup writes for `app`. `audience` is the canonical operations URL, as the workflow requests its token for. */
export function desiredCiDeployRecords(
	{ app, names, audience, source }: { app: string; names: CiDeployNames; audience: string; source: CiDeploySource },
): CiDeployRecords {
	const { repositoryId, repository, workflow, branch, environment } = source;
	return {
		names,
		role: { role: names.role, permission: { super_user: false, operations: CI_DEPLOY_OPERATIONS } },
		user: { username: names.user, role: names.role },
		policy: {
			id: names.policy,
			issuer: GITHUB_ACTIONS_ISSUER,
			audience,
			user: names.user,
			claims: {
				repository_id: repositoryId,
				workflow_ref: buildWorkflowRef(repository, workflow, branch),
				environment,
			},
			operations: CI_DEPLOY_OPERATIONS,
			// The CLI's own words, so the two read the same in the trust policies list.
			description: `GitHub Actions deploys of ${app} from ${repository} (${workflow} on ${branch})`,
		},
	};
}

export interface CiDeployExisting {
	roles: unknown[];
	users: unknown[];
	policies: unknown[];
}

export interface CiDeployPlan {
	role: Reconcile;
	user: Reconcile;
	policy: Reconcile;
	conflicts: string[];
}

/** An enabled, exchangeable policy for another user or scope that could match the same runs. */
function rivalPolicyProblem(policies: unknown[], wanted: DesiredPolicy): string | undefined {
	const rival = (policies as Array<Partial<OidcTrustPolicy> & { exchangeable?: unknown }>).find(
		(policy) =>
			policy?.id !== wanted.id
			&& policy?.enabled !== false
			&& policy?.exchangeable !== false
			&& policiesOverlap(policy, wanted)
			&& !sameAuthority(policy, wanted),
	);
	if (!rival) {
		return undefined;
	}
	return `Trust policy "${rival.id}", for user "${rival.user}", can match the same runs, and GitHub Actions can't sign`
		+ ' in to a run two policies give different users or operations. Give this application its own workflow file or'
		+ ' environment, or drop that policy if this application should deploy from those runs instead.';
}

/** harper's `planReconcile`, with a hint that names Studio's page rather than the CLI's command. */
export function planCiDeploy(existing: CiDeployExisting, desired: CiDeployRecords): CiDeployPlan {
	const plan = planIdentityReconcile(
		{ roles: existing.roles, users: existing.users, policies: existing.policies },
		{ role: desired.role, user: desired.user, policies: [desired.policy] },
		() => 'To replace it, drop it on the Trust Policies page and set this up again.',
	);
	const rival = rivalPolicyProblem(existing.policies, desired.policy);
	if (rival) {
		plan.conflicts.push(rival);
	}
	return { role: plan.role, user: plan.user, policy: plan.policies[0], conflicts: plan.conflicts };
}

/** Why setup stopped, and what it had created by then; running it again creates only what is still missing. */
export class CiDeploySetupError extends Error {
	readonly kind: 'refused' | 'failed' | 'unverified';
	readonly problems: string[];
	readonly created: string[];

	constructor(kind: CiDeploySetupError['kind'], problems: string[], created: string[], cause?: unknown) {
		super(problems.join('\n'), { cause });
		this.name = 'CiDeploySetupError';
		this.kind = kind;
		this.problems = problems;
		this.created = created;
	}
}

export interface CiDeploySetupResult {
	created: string[];
	warning?: string;
	policy: OidcTrustPolicy;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- list responses are read as the cluster sent them. */
async function listRecords(instanceClient: InstanceClientConfig['instanceClient'], operation: string): Promise<any[]> {
	const { data } = await instanceClient.post('/', { operation });
	const records = operation === 'list_oidc_trust' ? (data as any)?.policies : data;
	return Array.isArray(records) ? records : [];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function readCiDeployExisting(
	{ instanceClient }: InstanceClientConfig,
): Promise<CiDeployExisting> {
	const [policies, roles, users] = await Promise.all(
		['list_oidc_trust', 'list_roles', 'list_users'].map((operation) => listRecords(instanceClient, operation)),
	);
	return { policies, roles, users };
}

/** Nothing signs in with it, and it is never shown: runs authenticate through the trust policy. */
function unusablePassword(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

/**
 * Creates what is missing, in the CLI's order, then reads the policy back and compares it claim by claim: a mismatch
 * would otherwise surface only as the exchange's opaque 401 in CI.
 */
export async function setUpCiDeploy(
	{ instanceClient, desired }: InstanceClientConfig & { desired: CiDeployRecords },
): Promise<CiDeploySetupResult> {
	const { names } = desired;
	const plan = planCiDeploy(await readCiDeployExisting({ instanceClient }), desired);
	if (plan.conflicts.length > 0) {
		throw new CiDeploySetupError('refused', plan.conflicts, []);
	}

	const created: string[] = [];
	let warning: string | undefined;
	try {
		if (plan.role === 'create') {
			await instanceClient.post('/', { operation: 'add_role', ...desired.role });
			created.push(`role ${names.role}`);
		}
		if (plan.user === 'create') {
			await instanceClient.post('/', {
				operation: 'add_user',
				username: names.user,
				role: names.role,
				active: true,
				password: unusablePassword(),
			});
			created.push(`user ${names.user}`);
		}
		if (plan.policy === 'create') {
			// add_oidc_trust replaces, so a policy another super user created since the first read would be overwritten.
			// Reading again narrows that to one round trip, as the CLI does; one created within it is still replaced.
			const policies = await listRecords(instanceClient, 'list_oidc_trust');
			if (policies.some((policy) => policy?.id === names.policy)) {
				throw new CiDeploySetupError('refused', [
					`Trust policy "${names.policy}" was created while setup ran. Set this up again to check it.`,
				], created);
			}
			const rival = rivalPolicyProblem(policies, desired.policy);
			if (rival) {
				throw new CiDeploySetupError('refused', [`${rival} Set this up again to check it.`], created);
			}
			const { data } = await instanceClient.post<{ warning?: unknown }>('/', {
				operation: 'add_oidc_trust',
				...desired.policy,
			});
			warning = typeof data?.warning === 'string' ? data.warning : undefined;
			created.push(`trust policy ${names.policy}`);
		}
	} catch (error) {
		throw error instanceof CiDeploySetupError ? error : new CiDeploySetupError('failed', [], created, error);
	}

	let stored: OidcTrustPolicy | undefined;
	try {
		stored = (await listRecords(instanceClient, 'list_oidc_trust')).find((policy) => policy?.id === names.policy);
	} catch (error) {
		throw new CiDeploySetupError('failed', [], created, error);
	}
	const problems = stored ? policyDifferences(stored, desired.policy) : ['it is missing'];
	if (stored?.invalid_reason) {
		problems.push(stored.invalid_reason);
	}
	if (!stored || problems.length > 0) {
		throw new CiDeploySetupError('unverified', [
			`Trust policy "${names.policy}" did not verify: ${problems.join('; ')}.`,
		], created);
	}
	return { created, warning, policy: stored };
}

/**
 * The panel renders every failure beside the form, so the global toast would repeat it. Refusals and 4xx answers are
 * expected; the rest still has to reach RUM, which only `console.error` does (AGENTS.md, "Dropping `errorHandler`").
 */
export function useSetUpCiDeploy() {
	return useMutation({
		mutationFn: setUpCiDeploy,
		meta: { skipGlobalErrorToast: true },
		onError: (error: unknown) => {
			const cause = error instanceof CiDeploySetupError ? error.cause : error;
			if (error instanceof CiDeploySetupError && error.kind !== 'failed') {
				return;
			}
			const status = isAxiosError(cause) ? cause.response?.status : undefined;
			if (!status || status >= 500) {
				console.error(cause);
			}
		},
	});
}

/** Whether a failed setup may have written something its answer didn't confirm. Setting up again is still safe. */
export function ciDeploySetupUnanswered(error: unknown): boolean {
	return error instanceof CiDeploySetupError && error.kind === 'failed' && isUnansweredWrite(error.cause);
}
