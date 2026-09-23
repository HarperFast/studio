import { apiClient } from '@/config/apiClient';
import type { paths } from '@/integrations/api/api.gen';
import { AdminClusterGrant, GrantShapeEntry } from '@/integrations/api/api.patch';
import { useMutation } from '@tanstack/react-query';

/**
 * The patchable terms of a grant. `source` and `clusterId` are absent on purpose — central-manager
 * does not accept them, because changing either means a different grant, and the lifecycle code
 * mints a replacement rather than mutating one. `status` only ever moves to REVOKED.
 */
export interface UpdateGrantChanges {
	/** null = no expiry. A trial cannot be made perpetual; the server refuses it. */
	endsAt?: string | null;
	/** Contracted grants only; the server refuses it on any other source. Takes effect at the next renewal. */
	cadence?: 'anniversary' | 'calendar';
	expiryPolicy?: string;
	status?: 'REVOKED';
	/** null clears the restriction; an empty array is refused by the server. */
	allowedPlanIds?: string[] | null;
	allowedRegionIds?: string[] | null;
	/** A comp's shape. Only an UNBOUND comp may change it; the server answers 409 for a bound one. */
	shape?: GrantShapeEntry[];
	/** Required on every patch — the server enforces it, and the table shows it afterwards. */
	reason: string;
}

export type UpdateGrantInput = { id: string; changes: UpdateGrantChanges };

/** Served by central-manager but absent from the generated spec, like the rest of Admin/ClusterGrant. */
const grantPath = (id: string) => `/Admin/ClusterGrant/${id}` as unknown as keyof paths;

/**
 * PATCH /Admin/ClusterGrant/:id → change an active grant's terms. Requires `grant:write`.
 *
 * Only ACTIVE grants can be patched: an expired or revoked grant is history, and the server
 * answers 409 for one. Revoking is exempt from the other guards — it is the escape hatch for a
 * grant already in a bad state.
 */
export async function updateGrant({ id, changes }: UpdateGrantInput): Promise<AdminClusterGrant> {
	const { data } = await apiClient.patch(grantPath(id), changes);
	return data as unknown as AdminClusterGrant;
}

export function useUpdateGrantMutation() {
	// The dialogs toast the failure themselves, under their own heading; the global toast would stack a duplicate.
	return useMutation<AdminClusterGrant, Error, UpdateGrantInput>({
		mutationFn: updateGrant,
		meta: { skipGlobalErrorToast: true },
	});
}

/**
 * What `POST /Admin/ClusterGrant` accepts. Exactly one of `clusterId` or `organizationId` — the
 * server enforces the xor, and the two mean different things: bound to a cluster now, or an
 * unbound voucher that cluster creation claims later.
 */
export interface CreateGrantBody {
	clusterId?: string;
	organizationId?: string;
	source: 'trial' | 'comped';
	startsAt?: string;
	/** Omitted or null = forever, which only gift and comp may be. */
	endsAt?: string | null;
	expiryPolicy?: string;
	allowedPlanIds?: string[] | null;
	allowedRegionIds?: string[] | null;
	/** Required on comped and refused on anything else: the one cluster the comp is for. */
	shape?: GrantShapeEntry[];
	/** Unbound only: mint this many identical vouchers in one request (1–100). Refused with a clusterId. */
	quantity?: number;
	reason: string;
}

const GRANTS_COLLECTION = '/Admin/ClusterGrant' as unknown as keyof paths;

/**
 * POST /Admin/ClusterGrant → mint one grant, or a batch. Requires `grant:write`. The server answers
 * `{ grants }` when the request carried a quantity and the bare grant when it did not; callers get an
 * array either way.
 */
export async function createGrant(body: CreateGrantBody): Promise<AdminClusterGrant[]> {
	const { data } = await apiClient.post(GRANTS_COLLECTION, body);
	// Never throws on a success: a throw here reads as a failed create, and a re-submit mints the
	// batch again. A body with no recognisable grant yields an empty list, which the caller reports.
	const result: unknown = data;
	if (!result || typeof result !== 'object') { return []; }
	if ('grants' in result) { return Array.isArray(result.grants) ? (result.grants as AdminClusterGrant[]) : []; }
	return 'id' in result ? [result as AdminClusterGrant] : [];
}

export function useCreateGrantMutation() {
	// As above: the create dialog toasts the failure itself.
	return useMutation<AdminClusterGrant[], Error, CreateGrantBody>({
		mutationFn: createGrant,
		meta: { skipGlobalErrorToast: true },
	});
}
