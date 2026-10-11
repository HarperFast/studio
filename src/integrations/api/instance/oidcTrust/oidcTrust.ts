/**
 * OIDC trust policies (`system.hdb_oidc_trust`, Harper 5.3+, HarperFast/harper#2171): each lets an
 * external CI run trade its OIDC identity token for a one-hour Harper operation token, acting as a
 * named user. All three operations are super_user only, enforced in their handlers. Rows reach every
 * node through system-table replication, so any node lists the same set.
 */
import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';
import { queryOptions, useMutation } from '@tanstack/react-query';

/** The first tagged build with add/list/drop_oidc_trust. */
export const TRUST_POLICIES_MIN_VERSION = '5.3.0-alpha.1';

export function supportsTrustPolicies(version: string | undefined): boolean {
	return !!version && wasAReleasedBeforeB(TRUST_POLICIES_MIN_VERSION, version);
}

/**
 * One `list_oidc_trust` row. Harper reports each value as stored rather than coercing it, and marks a
 * row the token exchange would refuse with `invalid_reason` — so `operations` and `enabled` may hold
 * any shape on such a row.
 */
export interface OidcTrustPolicy {
	id: string;
	issuer: string;
	audience: string;
	/** Claim name → the value, or values, the token's claim must equal exactly. */
	claims: Record<string, unknown>;
	/** The user the exchanged token acts as. */
	user: string;
	/** null: the token carries everything the user's role allows. */
	operations: unknown;
	enabled: unknown;
	invalid_reason?: string;
	description?: string | null;
	updated_by?: string | null;
	__createdtime__?: number;
	__updatedtime__?: number;
}

interface ListOidcTrustResponse {
	policies?: unknown;
}

function isPolicyRow(row: unknown): row is OidcTrustPolicy {
	return !!row && typeof row === 'object' && typeof (row as { id?: unknown }).id === 'string';
}

async function listOidcTrust({ instanceClient }: InstanceClientIdConfig): Promise<OidcTrustPolicy[]> {
	const { data } = await instanceClient.post<ListOidcTrustResponse>('/', { operation: 'list_oidc_trust' });
	return Array.isArray(data?.policies) ? data.policies.filter(isPolicyRow) : [];
}

export function listOidcTrustQueryOptions(params: InstanceClientIdConfig & { enabled?: boolean }) {
	return queryOptions({
		queryKey: [params.entityId, 'list_oidc_trust'] as const,
		queryFn: () => listOidcTrust(params),
		enabled: params.enabled,
	});
}

export function isTrustPolicyScoped(policy: OidcTrustPolicy): boolean {
	return policy.operations != null;
}

/**
 * The `add_oidc_trust` request that stores `policy` again with only `enabled` changed. The operation
 * replaces the whole row, so every stored field goes back; absent ones are omitted because its
 * validator takes no nulls. A scope that is neither absent nor a list of names is refused rather than
 * omitted, since omitting it would store the policy unscoped and widen what its token can do.
 */
export function trustPolicyResaveRequest(policy: OidcTrustPolicy, enabled: boolean) {
	const { operations, description } = policy;
	if (operations != null && !(Array.isArray(operations) && operations.every((name) => typeof name === 'string'))) {
		throw new Error(`Trust policy '${policy.id}' has a malformed operations scope, so it cannot be re-saved.`);
	}
	return {
		operation: 'add_oidc_trust',
		id: policy.id,
		issuer: policy.issuer,
		audience: policy.audience,
		claims: policy.claims,
		user: policy.user,
		...(operations != null ? { operations } : {}),
		enabled,
		...(typeof description === 'string' ? { description } : {}),
	};
}

function storedShape(policy: OidcTrustPolicy): string {
	return JSON.stringify([
		policy.__updatedtime__ ?? null,
		policy.issuer,
		policy.audience,
		policy.claims,
		policy.user,
		policy.operations ?? null,
		policy.enabled,
		policy.description ?? null,
	]);
}

export interface SetTrustPolicyEnabledArgs extends InstanceClientIdConfig {
	/** The row as the page last showed it. */
	loaded: OidcTrustPolicy;
	enabled: boolean;
}

/**
 * Re-reads the policy first and refuses if it changed since `loaded`: the write replaces the row, so
 * re-saving a stale copy would undo whatever another administrator changed in between. A change
 * landing within this one round trip still loses; closing that needs a conditional write in Harper.
 */
export async function setTrustPolicyEnabled({ loaded, enabled, ...params }: SetTrustPolicyEnabledArgs) {
	const current = (await listOidcTrust(params)).find((policy) => policy.id === loaded.id);
	if (!current) {
		throw new Error(`Trust policy '${loaded.id}' no longer exists.`);
	}
	if (storedShape(current) !== storedShape(loaded)) {
		throw new Error(`Trust policy '${loaded.id}' changed since this page loaded it. Review it and try again.`);
	}
	const { data } = await params.instanceClient.post<{ message: string }>(
		'/',
		trustPolicyResaveRequest(current, enabled),
	);
	return data;
}

export function useSetTrustPolicyEnabled() {
	return useMutation({ mutationFn: setTrustPolicyEnabled });
}

export interface DropTrustPolicyArgs extends InstanceClientIdConfig {
	id: string;
}

async function dropOidcTrust({ instanceClient, id }: DropTrustPolicyArgs) {
	const { data } = await instanceClient.post<{ message: string }>('/', { operation: 'drop_oidc_trust', id });
	return data;
}

export function useDropTrustPolicy() {
	return useMutation({ mutationFn: dropOidcTrust });
}
