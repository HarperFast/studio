import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';
import { SchemaOrganization } from '@/lib/api.gen';

async function onNewOrganizationSubmit(newOrg: Omit<SchemaOrganization, 'id' | 'type'>): Promise<SchemaOrganization> {
	const { data } = await apiClient.post('/Organization/', {
		...newOrg,
	});
	return data;
}

export function useCreateNewOrganizationMutation() {
	return useMutation<SchemaOrganization, Error, Omit<SchemaOrganization, 'id' | 'type'>>({
		mutationFn: (clusterInfo) => onNewOrganizationSubmit(clusterInfo),
	});
}
