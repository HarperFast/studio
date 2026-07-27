import { InstanceClientConfig, InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { LocalUser } from '@/integrations/api/api.patch';
import { pollUnlessForbidden, retryUnlessForbidden } from '@/react-query/pollUnlessForbidden';
import { queryOptions } from '@tanstack/react-query';

export function getListUsersQueryOptions({ entityId, instanceClient }: InstanceClientIdConfig) {
	return queryOptions({
		queryKey: [entityId, 'list_users'] as const,
		queryFn: () => getListUsers({ instanceClient }),
		// `list_users` is a superuser-only operation, so a read-only member sitting on
		// the Users tab 403s on every tick — stop rather than poll it forever.
		refetchInterval: pollUnlessForbidden(10_000),
		retry: retryUnlessForbidden(),
	});
}

async function getListUsers({ instanceClient }: InstanceClientConfig) {
	const { data } = await instanceClient.post('/', {
		operation: 'list_users',
	});
	return data as LocalUser[];
}
