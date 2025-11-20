import { InstanceClientConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { ReplicatedResponse } from '@/integrations/api/replication';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';

export const SSHKeySchema = z.object({
	name: z
		.string()
		.trim()
		.regex(/^[a-zA-Z0-9-_]*$/, { error: 'Can only contain letters, numbers, dashes and underscores.' }),
	key: z.string().trim(),
	host: z.string().trim(),
	hostname: z.string().trim(),
	known_hosts: z.string().trim().optional(),
});

type AddSSHKeyFormData = z.infer<typeof SSHKeySchema> & InstanceClientConfig & InstanceTypeConfig;

async function addSSHKey(formData: AddSSHKeyFormData) {
	const { instanceClient, entityType, ...sshKey } = formData;
	const { data } = await instanceClient.post<ReplicatedResponse>('/', {
		operation: 'add_ssh_key',
		replicated: entityType === 'cluster',
		...sshKey,
	});
	return data;
}

export function useAddSSHKey() {
	return useMutation({
		mutationFn: addSSHKey,
	});
}
