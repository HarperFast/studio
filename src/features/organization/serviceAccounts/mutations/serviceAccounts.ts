import { apiClient } from '@/config/apiClient';
import { ServiceAccount } from '@/integrations/api/api.patch';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface CreateServiceAccountPayload {
	organizationId: string;
	name: string;
	roleId: string;
}

interface UpdateServiceAccountPayload {
	id: string;
	name?: string;
	roleId?: string;
	status?: ServiceAccount['status'];
}

async function createServiceAccount(payload: CreateServiceAccountPayload): Promise<ServiceAccount> {
	const { data } = await apiClient.post('/ServiceAccount/' as '/Cluster/', payload);
	return data as unknown as ServiceAccount;
}

async function updateServiceAccount({ id, ...changes }: UpdateServiceAccountPayload): Promise<ServiceAccount> {
	const { data } = await apiClient.patch(`/ServiceAccount/${encodeURIComponent(id)}` as '/Cluster/{id}', changes);
	return data as unknown as ServiceAccount;
}

async function deleteServiceAccount({ id }: { id: string }) {
	const { data } = await apiClient.delete(`/ServiceAccount/${encodeURIComponent(id)}` as '/Cluster/{id}');
	return data;
}

// Cache upkeep lives on the mutation, not on per-call callbacks, which never run once their page unmounts.
// Refetches are not awaited, so a caller's own onSuccess does not wait for them.

export function useCreateServiceAccountMutation(organizationId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: createServiceAccount,
		// Listed at once, so the caller can select it before the refetch lands.
		onSuccess: (serviceAccount) => {
			queryClient.setQueryData<ServiceAccount[]>(
				[organizationId, 'serviceAccounts'],
				(accounts) => accounts && [...accounts.filter((account) => account.id !== serviceAccount.id), serviceAccount],
			);
			void queryClient.invalidateQueries({ queryKey: [organizationId, 'serviceAccounts'], refetchType: 'active' });
		},
	});
}

export function useUpdateServiceAccountMutation(organizationId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: updateServiceAccount,
		onSuccess: (serviceAccount) => {
			queryClient.setQueryData<ServiceAccount[]>(
				[organizationId, 'serviceAccounts'],
				(accounts) => accounts?.map((account) => (account.id === serviceAccount.id ? serviceAccount : account)),
			);
			void queryClient.invalidateQueries({ queryKey: [organizationId, 'serviceAccounts'], exact: true });
		},
	});
}

export function useDeleteServiceAccountMutation(organizationId: string) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: deleteServiceAccount,
		onSuccess: (_, { id }) => {
			queryClient.setQueryData<ServiceAccount[]>(
				[organizationId, 'serviceAccounts'],
				(accounts) => accounts?.filter((account) => account.id !== id),
			);
			void queryClient.invalidateQueries({ queryKey: [organizationId, 'serviceAccounts'], exact: true });
		},
	});
}
