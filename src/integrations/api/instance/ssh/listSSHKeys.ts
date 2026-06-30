import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { queryOptions } from '@tanstack/react-query';

export interface SSHKeyName {
	name: string;
	/** The unique alias for this key (e.g. "my-repo.github.com"); used in URLs to pick the key. */
	host?: string;
	/** The actual hostname the request resolves to (e.g. "github.com"). */
	hostname?: string;
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
	});
}
