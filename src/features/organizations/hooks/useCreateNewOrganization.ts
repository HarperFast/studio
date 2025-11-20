import { apiClient } from '@/config/apiClient';
import { SchemaOrganization } from '@/integrations/api/api.gen';
import { useMutation } from '@tanstack/react-query';

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
