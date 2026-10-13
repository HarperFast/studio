import { apiClient } from '@/config/apiClient';
import { getOrganizationDomainsQueryOptions } from '@/features/organization/queries/getOrganizationDomains';
import { QueryClient, useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import z from 'zod';

export const DeleteDomainSchema = z.object({
	domainId: z.string(),
	organizationId: z.string(),
});

async function deleteDomainSubmit(formData: z.infer<typeof DeleteDomainSchema>) {
	// TODO: API does not describe this endpoint.
	const { data } = await apiClient.delete(`/Domain/${formData.domainId}` as any);
	return data;
}

const deleteDomainMutationKey = ['deleteDomain'] as const;

export function useDeleteDomain() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationKey: deleteDomainMutationKey,
		mutationFn: (formData: z.infer<typeof DeleteDomainSchema>) => deleteDomainSubmit(formData),
		onSuccess: (_data, { domainId, organizationId }) => {
			// Out of the list now, not when the refetch lands: a Bind selection is read against this
			// list, and would send the deleted id in between.
			queryClient.setQueryData(
				getOrganizationDomainsQueryOptions(organizationId).queryKey,
				(domains) => domains?.filter((domain) => domain.id !== domainId),
			);
		},
	});
}

export function isDeletingDomain(queryClient: QueryClient): boolean {
	return queryClient.isMutating({ mutationKey: deleteDomainMutationKey }) > 0;
}

export function useIsDeletingDomain(): boolean {
	return useIsMutating({ mutationKey: deleteDomainMutationKey }) > 0;
}
