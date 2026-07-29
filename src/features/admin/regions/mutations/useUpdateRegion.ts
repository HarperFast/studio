import { apiClient } from '@/config/apiClient';
import { AdminRegion, AdminRegionPayload } from '@/integrations/api/api.patch';
import { useMutation } from '@tanstack/react-query';

/** `id` identifies the region in the path and can't change; everything else is editable. */
export type UpdateRegionInput = { id: string; changes: Partial<Omit<AdminRegionPayload, 'id'>> };

/**
 * PATCH /Admin/Region/:id → update a region (super-user only). The id is the immutable primary key,
 * so it's sent in the path, not the body. The response is cast: the generated schema predates the
 * `active` flag.
 */
export async function updateRegion({ id, changes }: UpdateRegionInput): Promise<AdminRegion> {
	const { data } = await apiClient.patch(`/Admin/Region/${id}` as '/Admin/Region/{id}', changes);
	return data as unknown as AdminRegion;
}

export function useUpdateRegionMutation() {
	return useMutation<AdminRegion, Error, UpdateRegionInput>({ mutationFn: updateRegion });
}
