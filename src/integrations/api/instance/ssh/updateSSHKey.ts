import { InstanceClientConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { sshPrivateKeySchema } from '@/integrations/api/instance/ssh/sshPrivateKey';
import { ReplicatedResponse } from '@/integrations/api/replication';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';

export const UpdateSSHKeySchema = z.object({
	name: z.string().trim(),
	key: sshPrivateKeySchema,
});

type UpdateSSHKeyFormData = z.infer<typeof UpdateSSHKeySchema> & InstanceClientConfig & InstanceTypeConfig;

async function updateSSHKey(formData: UpdateSSHKeyFormData) {
	const { instanceClient, entityType, name, key } = formData;
	const { data } = await instanceClient.post<ReplicatedResponse>('/', {
		operation: 'update_ssh_key',
		replicated: entityType === 'cluster',
		name,
		key,
	});
	return data;
}

export function useUpdateSSHKey() {
	return useMutation({
		mutationFn: updateSSHKey,
	});
}
