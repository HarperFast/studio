/**
 * A port of harper's `security/ciIdentity.ts` (origin/main `5b1aea8bb`): how `harper deploy setup=true
 * provider=github-actions` decides, from what a cluster holds, which records to create and when to refuse. Studio's
 * Deploy from GitHub panel has to decide the same way, or a project set up by one would be refused, or repurposed, by the
 * other (harper `security/DESIGN.md`, "names Studio's setup must match"). Change it only alongside that file.
 *
 * Setup only creates. A record that already matches is kept, and one that differs, or was deactivated, stops setup
 * before it writes anything, so it never repurposes a role or undoes a revocation.
 */
import { OPERATION_GROUPS } from '@/features/instance/config/roles/operations/operationsCatalog';

export const GITHUB_ACTIONS_ISSUER = 'https://token.actions.githubusercontent.com';

export interface DesiredRole {
	role: string;
	permission: { super_user: false; operations: string[]; component_deploy?: unknown };
}

export interface DesiredUser {
	username: string;
	role: string;
}

export interface DesiredPolicy {
	id: string;
	issuer: string;
	audience: string;
	user: string;
	claims: Record<string, string>;
	operations: string[];
	description: string;
}

export interface DesiredIdentity {
	role: DesiredRole;
	user: DesiredUser;
	policies: DesiredPolicy[];
}

export type Reconcile = 'create' | 'keep';

export interface IdentityPlan {
	role: Reconcile;
	user: Reconcile;
	policies: Reconcile[];
	conflicts: string[];
}

/* eslint-disable @typescript-eslint/no-explicit-any -- these read records as the cluster stored them, any shape. */

const sameSet = (left: unknown, right: string[]) =>
	Array.isArray(left) && left.length === right.length && right.every((entry) => left.includes(entry));

const groupMembers = new Map(OPERATION_GROUPS.map((group) => [group.name, group.members]));

/** Harper's `expandOperationsPerms`: a group becomes its members, verbatim; anything else passes through. */
function expandOperations(operations: unknown[]): Set<unknown> {
	const allowed = new Set<unknown>();
	for (const item of operations) {
		const members = typeof item === 'string' ? groupMembers.get(item) : undefined;
		if (members) {
			members.forEach((member) => allowed.add(member));
		} else {
			allowed.add(item);
		}
	}
	return allowed;
}

/**
 * An absent scope is unscoped, which no array is, not even an empty one. Arrays compare as the operations they allow,
 * with groups expanded as authorization expands them, so `['read_only']` equals the list it stands for.
 */
function sameOperationScope(left: unknown, right: unknown): boolean {
	if (!Array.isArray(left) || !Array.isArray(right)) {
		return Array.isArray(left) === Array.isArray(right);
	}
	const leftOperations = expandOperations(left);
	const rightOperations = expandOperations(right);
	return leftOperations.size === rightOperations.size && [...leftOperations].every((op) => rightOperations.has(op));
}

export function sameAuthority(left: any, right: any): boolean {
	return left?.user === right?.user && sameOperationScope(left?.operations, right?.operations);
}

const ROLE_FLAGS = new Set(['super_user', 'structure_user', 'cluster_user', 'operations', 'component_deploy']);

function sameValue(left: unknown, right: unknown): boolean {
	if (left === right) {
		return true;
	}
	if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) {
		return false;
	}
	if (Array.isArray(left) !== Array.isArray(right)) {
		return false;
	}
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	return leftKeys.length === rightKeys.length
		&& rightKeys.every((key) => Object.hasOwn(left, key) && sameValue((left as any)[key], (right as any)[key]));
}

/** A component grant's names are a set; its constraints are compared exactly. */
function sameGrant(existing: any, desired: any): boolean {
	if (existing === undefined || desired === undefined) {
		return existing === desired;
	}
	return typeof existing === 'object'
		&& existing !== null
		&& sameSet(existing.names, desired.names)
		&& sameValue(existing.constraints, desired.constraints)
		&& Object.keys(existing).every((key) => key === 'names' || key === 'constraints');
}

export function roleDifference(existing: any, desired: DesiredRole): string | undefined {
	const permission = existing?.permission ?? {};
	if (permission.super_user === true) {
		return 'it is a super_user role';
	}
	for (const flag of ['structure_user', 'cluster_user']) {
		if (permission[flag]) {
			return `it sets ${flag}`;
		}
	}
	if (!sameSet(permission.operations, desired.permission.operations)) {
		return `its operations are ${JSON.stringify(permission.operations ?? null)}, not ${
			JSON.stringify(desired.permission.operations)
		}`;
	}
	if (!sameGrant(permission.component_deploy, desired.permission.component_deploy)) {
		return `its component_deploy grant is ${JSON.stringify(permission.component_deploy ?? null)}, not ${
			JSON.stringify(desired.permission.component_deploy ?? null)
		}`;
	}
	const tableGrants = Object.keys(permission).filter((key) => !ROLE_FLAGS.has(key));
	if (tableGrants.length > 0) {
		return `it grants database permissions (${tableGrants.join(', ')})`;
	}
	return undefined;
}

export function userDifference(existing: any, desired: DesiredUser): string | undefined {
	const roleName = typeof existing?.role === 'object' ? existing.role?.role : existing?.role;
	if (roleName !== desired.role) {
		return `it is in role "${roleName}", not "${desired.role}"`;
	}
	if (existing.active === false) {
		return 'it is inactive';
	}
	return undefined;
}

export function policyDifferences(existing: any, desired: DesiredPolicy): string[] {
	const differences: string[] = [];
	for (const field of ['issuer', 'audience', 'user'] as const) {
		if (existing?.[field] !== desired[field]) {
			differences.push(`${field} is ${JSON.stringify(existing?.[field])}, not ${JSON.stringify(desired[field])}`);
		}
	}
	const claims = existing?.claims ?? {};
	const claimNames = new Set([...Object.keys(claims), ...Object.keys(desired.claims)]);
	for (const name of claimNames) {
		if (claims[name] !== desired.claims[name]) {
			differences.push(`claim ${name} is ${JSON.stringify(claims[name])}, not ${JSON.stringify(desired.claims[name])}`);
		}
	}
	if (!sameOperationScope(existing?.operations, desired.operations)) {
		differences.push(
			`operations are ${JSON.stringify(existing?.operations ?? null)}, not ${JSON.stringify(desired.operations)}`,
		);
	}
	if (existing?.enabled === false) {
		differences.push('it is disabled');
	}
	return differences;
}

export function planIdentityReconcile(
	existing: { roles: any[]; users: any[]; policies: any[] },
	desired: DesiredIdentity,
	replaceHint: (policyId: string) => string,
): IdentityPlan {
	const conflicts: string[] = [];
	const role = existing.roles.find((candidate) => candidate?.role === desired.role.role);
	const roleProblem = role && roleDifference(role, desired.role);
	if (roleProblem) {
		conflicts.push(`Role "${desired.role.role}" already exists and ${roleProblem}.`);
	}

	const user = existing.users.find((candidate) => candidate?.username === desired.user.username);
	const userProblem = user && userDifference(user, desired.user);
	if (userProblem) {
		conflicts.push(`User "${desired.user.username}" already exists and ${userProblem}.`);
	}

	const policies = desired.policies.map((wanted): Reconcile => {
		const policy = existing.policies.find((candidate) => candidate?.id === wanted.id);
		const problems = policy ? policyDifferences(policy, wanted) : [];
		if (problems.length > 0) {
			conflicts.push(
				`Trust policy "${wanted.id}" already exists and ${problems.join('; ')}. ${replaceHint(wanted.id)}`,
			);
		}
		return policy ? 'keep' : 'create';
	});
	return { role: role ? 'keep' : 'create', user: user ? 'keep' : 'create', policies, conflicts };
}

/**
 * Whether one token could match both policies: the same issuer, and for every claim both constrain, a value both
 * accept. The exchange refuses a token two policies match with different users or operations, so such a pair stops the
 * runs it matches. GitHub's tokens name one audience, so two GitHub policies for different audiences never share one;
 * and GitHub refuses a `pull_request_target` run to a policy that leaves `event_name` open, so such a policy shares no
 * token with one that accepts only those runs.
 */
export function policiesOverlap(left: any, right: any): boolean {
	if (left?.issuer !== right?.issuer) {
		return false;
	}
	const github = left?.issuer === GITHUB_ACTIONS_ISSUER;
	const leftClaims = left?.claims ?? {};
	const rightClaims = right?.claims ?? {};
	if (left?.audience !== right?.audience && (github || leftClaims.aud !== undefined || rightClaims.aud !== undefined)) {
		return false;
	}
	const accepted = (value: unknown) => (Array.isArray(value) ? value : [value]).map(String);
	for (const name of Object.keys(leftClaims)) {
		if (!Object.hasOwn(rightClaims, name)) {
			continue;
		}
		const rightValues = accepted(rightClaims[name]);
		if (!accepted(leftClaims[name]).some((value) => rightValues.includes(value))) {
			return false;
		}
	}
	if (github) {
		const onlyPullRequestTarget = (claims: any) =>
			claims.event_name !== undefined
			&& accepted(claims.event_name).every((event) => event === 'pull_request_target');
		if (leftClaims.event_name === undefined && onlyPullRequestTarget(rightClaims)) {
			return false;
		}
		if (rightClaims.event_name === undefined && onlyPullRequestTarget(leftClaims)) {
			return false;
		}
	}
	return true;
}
