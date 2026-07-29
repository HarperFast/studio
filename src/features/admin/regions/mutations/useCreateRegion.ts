import { apiClient } from '@/config/apiClient';
import { AdminRegion, AdminRegionPayload } from '@/integrations/api/api.patch';
import { useMutation } from '@tanstack/react-query';

/**
 * POST /Admin/Region → create a region (super-user only).
 *
 * The response is cast: the generated schema predates the `active` flag.
 */
export async function createRegion(payload: AdminRegionPayload): Promise<AdminRegion> {
	const { data } = await apiClient.post('/Admin/Region/', payload);
	return data as unknown as AdminRegion;
}

export function useCreateRegionMutation() {
	return useMutation<AdminRegion, Error, AdminRegionPayload>({ mutationFn: createRegion });
}
