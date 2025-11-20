import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { queryOptions } from '@tanstack/react-query';

interface GetSSHKeyFormData extends InstanceClientIdConfig {
	name: string;
}

interface SSHKey {
	name: string;
	key: unknown;
	host?: string;
	hostname?: string;
}

async function getSSHKey({ name, instanceClient }: GetSSHKeyFormData) {
	const { data } = await instanceClient.post<SSHKey>('/', {
		operation: 'get_ssh_key',
		name,
	});
	return data;
}

export function getSSHKeyQueryOptions(params: GetSSHKeyFormData) {
	return queryOptions({
		queryKey: [params.entityId, 'get_ssh_key'] as const,
		queryFn: () => getSSHKey(params),
		refetchInterval: 10_000,
	});
}
