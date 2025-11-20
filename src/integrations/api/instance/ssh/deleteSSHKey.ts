import { InstanceClientConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { ReplicatedResponse } from '@/integrations/api/replication';
import { useMutation } from '@tanstack/react-query';

interface DeleteSSHKeyFormData extends InstanceClientConfig, InstanceTypeConfig {
	name: string;
}

async function deleteSSHKey(formData: DeleteSSHKeyFormData) {
	const { instanceClient, entityType, name } = formData;
	const { data } = await instanceClient.post<ReplicatedResponse>('/', {
		operation: 'delete_ssh_key',
		replicated: entityType === 'cluster',
		name,
	});
	return data;
}

export function useDeleteSSHKey() {
	return useMutation({
		mutationFn: deleteSSHKey,
	});
}
