import { apiClient } from '@/config/apiClient';
import type { paths } from '@/integrations/api/api.gen';
import { AdminClusterGrant } from '@/integrations/api/api.patch';
import { useMutation } from '@tanstack/react-query';

/**
 * The patchable terms of a grant. `source` and `clusterId` are absent on purpose — central-manager
 * does not accept them, because changing either means a different grant, and the lifecycle code
 * mints a replacement rather than mutating one. `status` only ever moves to REVOKED.
 */
export interface UpdateGrantChanges {
	/** null = no expiry. A trial cannot be made perpetual; the server refuses it. */
	endsAt?: string | null;
	expiryPolicy?: string;
	status?: 'REVOKED';
	/** null clears the restriction; an empty array is refused by the server. */
	allowedPlanIds?: string[] | null;
	allowedRegionIds?: string[] | null;
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
	return useMutation<AdminClusterGrant, Error, UpdateGrantInput>({ mutationFn: updateGrant });
}
