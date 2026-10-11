import { apiClient } from '@/config/apiClient';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export async function onDeleteOrganization(orgId: string) {
	const { data } = await apiClient.delete(`/Organization/${orgId}` as '/Organization/{id}');
	return data;
}

export function useDeleteOrganizationMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (orgId: string) => onDeleteOrganization(orgId),
		onSuccess: (_data, orgId) => {
			// Invalidating would keep the deleted org's cached record, and the org route's
			// `ensureQueryData` serves cached data without a request: navigating back to it would
			// render the deleted org and then 403 on the mount refetch. Dropping it makes the route
			// ask the server instead.
			queryClient.removeQueries({ queryKey: [orgId] });
			void queryClient.invalidateQueries({ queryKey: [] });
		},
	});
}
