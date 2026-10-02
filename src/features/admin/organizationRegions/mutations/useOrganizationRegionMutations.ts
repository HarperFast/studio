import { apiClient } from '@/config/apiClient';
import { OrganizationRegion, OrganizationRegionPatch, OrganizationRegionPayload } from '@/integrations/api/api.patch';
import { useMutation } from '@tanstack/react-query';

/** POST /OrganizationRegion/ → create a custom region for an organization (region:write). */
export async function createOrganizationRegion(payload: OrganizationRegionPayload): Promise<OrganizationRegion> {
	const { data } = await apiClient.post('/OrganizationRegion/' as '/Region/', payload as never);
	return data as unknown as OrganizationRegion;
}

/**
 * PATCH /OrganizationRegion/:id (region:write). Send only what changed: while a live cluster references
 * the row, central-manager refuses any change to name, placement, fallbackGroup or blocksPerUnit (409),
 * so resubmitting an unchanged frozen field would turn an `active` toggle into a refusal.
 */
export async function updateOrganizationRegion(
	{ id, changes }: { id: string; changes: OrganizationRegionPatch },
): Promise<OrganizationRegion> {
	const { data } = await apiClient.patch(`/OrganizationRegion/${encodeURIComponent(id)}` as '/Region/{id}', changes as never);
	return data as unknown as OrganizationRegion;
}

export function useCreateOrganizationRegionMutation() {
	return useMutation<OrganizationRegion, Error, OrganizationRegionPayload>({ mutationFn: createOrganizationRegion });
}

export function useUpdateOrganizationRegionMutation() {
	return useMutation<OrganizationRegion, Error, { id: string; changes: OrganizationRegionPatch }>({
		mutationFn: updateOrganizationRegion,
	});
}
