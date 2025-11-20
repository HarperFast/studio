import { InstanceClientConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { ReplicatedResponse } from '@/integrations/api/replication';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';

export const UpdateSSHKeySchema = z.object({
	name: z.string().trim(),
	key: z.string().trim(),
});

type UpdateSSHKeyFormData = z.infer<typeof UpdateSSHKeySchema> & InstanceClientConfig & InstanceTypeConfig;

async function updateSSHKey(formData: UpdateSSHKeyFormData) {
	const { instanceClient, entityType, ...sshKey } = formData;
	const { data } = await instanceClient.post<ReplicatedResponse>('/', {
		operation: 'update_ssh_key',
		replicated: entityType === 'cluster',
		...sshKey,
	});
	return data;
}

export function useUpdateSSHKey() {
	return useMutation({
		mutationFn: updateSSHKey,
	});
}
