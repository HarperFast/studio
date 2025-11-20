import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { queryOptions } from '@tanstack/react-query';

interface SSHKeyName {
	name: string;
}

async function listSSHKeys({ instanceClient }: InstanceClientIdConfig) {
	const { data } = await instanceClient.post<SSHKeyName[]>('/', {
		operation: 'list_ssh_keys',
	});
	return data;
}

export function listSSHKeysQueryOptions(params: InstanceClientIdConfig) {
	return queryOptions({
		queryKey: [params.entityId, 'list_ssh_keys'] as const,
		queryFn: () => listSSHKeys(params),
		refetchInterval: 10_000,
	});
}
