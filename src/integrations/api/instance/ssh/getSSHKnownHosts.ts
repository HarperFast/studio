import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { queryOptions } from '@tanstack/react-query';

interface SSHKeyKnownHosts {
	known_hosts: unknown | null;
}

async function getSSHKnownHosts({ instanceClient }: InstanceClientIdConfig) {
	const { data } = await instanceClient.post<SSHKeyKnownHosts>('/', {
		operation: 'get_ssh_known_hosts',
	});
	return data;
}

export function getSSHKnownHostsQueryOptions(params: InstanceClientIdConfig) {
	return queryOptions({
		queryKey: [params.entityId, 'get_ssh_known_hosts'] as const,
		queryFn: () => getSSHKnownHosts(params),
		refetchInterval: 10_000,
	});
}
