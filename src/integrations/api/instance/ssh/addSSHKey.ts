import { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { ReplicatedResponse } from '@/integrations/api/replication';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';

export const SSHKeySchema = z.object({
	name: z
		.string()
		.trim()
		.min(1)
		.regex(/^[a-zA-Z0-9-_]*$/, { error: 'Can only contain letters, numbers, dashes and underscores.' }),
	key: z.string().min(1).trim(),
	host: z.string().min(1).trim(),
	hostname: z.string().min(1).trim(),
	known_hosts: z.string().trim().optional(),
});

type AddSSHKeyFormData = z.infer<typeof SSHKeySchema> & InstanceClientIdConfig & InstanceTypeConfig;

async function addSSHKey(formData: AddSSHKeyFormData) {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const { instanceClient, entityType, entityId, ...sshKey } = formData;
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
