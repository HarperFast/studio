import { InstanceClientConfig, InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { LocalRole } from '@/integrations/api/api.patch';
import { pollUnlessForbidden, retryUnlessRejected } from '@/react-query/pollUnlessForbidden';
import { queryOptions } from '@tanstack/react-query';

export function getListRolesQueryOptions({ entityId, instanceClient }: InstanceClientIdConfig) {
	return queryOptions({
		queryKey: [entityId, 'list_roles'] as const,
		queryFn: () => getListRoles({ instanceClient }),
		// Superuser-only like `list_users` above — the same 403-forever shape.
		refetchInterval: pollUnlessForbidden(10_000),
		retry: retryUnlessRejected(),
	});
}

async function getListRoles({ instanceClient }: InstanceClientConfig) {
	const { data } = await instanceClient.post('/', {
		operation: 'list_roles',
	});
	return data as LocalRole[];
}
