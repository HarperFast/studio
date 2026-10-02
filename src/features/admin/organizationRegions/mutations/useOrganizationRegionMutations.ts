import { apiClient } from '@/config/apiClient';
import { OrganizationRegion, OrganizationRegionPatch, OrganizationRegionPayload } from '@/integrations/api/api.patch';
import { useMutation } from '@tanstack/react-query';

export async function createOrganizationRegion(payload: OrganizationRegionPayload): Promise<OrganizationRegion> {
	const { data } = await apiClient.post('/OrganizationRegion/' as '/Region/', payload as never);
	return data as unknown as OrganizationRegion;
}

// Send only what changed: while a live cluster references the row, central-manager 409s any write to
// a frozen field, so resubmitting one unchanged would turn an `active` toggle into a refusal.
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
