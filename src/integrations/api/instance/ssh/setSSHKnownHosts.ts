import { InstanceClientConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { ReplicatedResponse } from '@/integrations/api/replication';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';

export const SSHKnownHostsSchema = z.object({
	known_hosts: z.string().trim(),
});

type SetSSHKnownHostsFormData = z.infer<typeof SSHKnownHostsSchema> & InstanceClientConfig & InstanceTypeConfig;

async function setSSHKnownHosts(formData: SetSSHKnownHostsFormData) {
	const { instanceClient, entityType, ...sshKey } = formData;
	const { data } = await instanceClient.post<ReplicatedResponse>('/', {
		operation: 'set_ssh_known_hosts',
		replicated: entityType === 'cluster',
		...sshKey,
	});
	return data;
}

export function useSetSSHKnownHosts() {
	return useMutation({
		mutationFn: setSSHKnownHosts,
	});
}
