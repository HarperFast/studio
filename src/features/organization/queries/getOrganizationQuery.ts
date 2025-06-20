import { apiClient } from '@/config/apiClient';
import { queryKeys } from '@/react-query/constants';
import { queryOptions } from '@tanstack/react-query';
import { SchemaCluster, SchemaOrganization } from '@/lib/api.gen';

// TODO: The OpenAPI type isn't very exhaustive.
interface Cluster extends SchemaCluster {
	id: string;
	name: string;
	organizationId: string;
	prefix: string;
	status: 'PROVISIONING' | 'RUNNING' | 'STOPPED' | 'TERMINATED';
}

// TODO: The OpenAPI type isn't very exhaustive.
interface Organization extends SchemaOrganization {
	id: string;
	name: string;
	subdomain: string;
	createdByUserId: string;
	clusters?: Cluster[];
}

async function getOrganization(orgId: string): Promise<Organization | null> {
	const { status, data } = await apiClient.get(`/Organization/${orgId}` as '/Organization/{id}');
	if (status == 200 && data) {
		return data as Organization;
	}
	return null;
}

function getOrganizationQueryOptions(orgId: string) {
	return queryOptions({
		queryKey: [queryKeys.organization, orgId],
		queryFn: () => getOrganization(orgId),
		retry: false,
	});
}

export { getOrganizationQueryOptions };
