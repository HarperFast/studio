import { apiClient } from '@/config/apiClient';
import { Organization } from '@/integrations/api/api.patch';
import { queryOptions } from '@tanstack/react-query';

// `useParams({ strict: false })` can yield `undefined`, and a navigation that
// interpolates a missing id into a path produces the literal string
// `"undefined"`/`"null"` — both would otherwise build a request to
// `/Organization/undefined`. Treat all of these as "no organization id".
export function isValidOrganizationId(orgId: string | undefined | null): orgId is string {
	return !!orgId && orgId !== 'undefined' && orgId !== 'null';
}

export async function getOrganization(orgId: string): Promise<Organization> {
	if (!isValidOrganizationId(orgId)) {
		// Fail fast instead of issuing a doomed `/Organization/undefined` request.
		// Guards the call paths that ignore react-query's `enabled` flag:
		// `ensureQueryData` (route beforeLoad), `useSuspenseQuery`, and direct callers.
		throw new Error(`getOrganization called without a valid organization id (got: ${orgId})`);
	}
	const { data } = await apiClient.get(`/Organization/${orgId}` as '/Organization/{id}');
	return data;
}

export function getOrganizationQueryOptions(orgId: string | undefined) {
	return queryOptions({
		queryKey: [orgId],
		queryFn: () => getOrganization(orgId as string),
		retry: false,
		enabled: isValidOrganizationId(orgId),
		refetchInterval: 10000,
	});
}
