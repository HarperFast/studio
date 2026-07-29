import { apiClient } from '@/config/apiClient';
import { SchemaOrganization } from '@/integrations/api/api.gen';
import { queryOptions } from '@tanstack/react-query';

/** Just what the org picker needs; the endpoint returns full organization records. */
export type AdminOrganizationSummary = Pick<SchemaOrganization, 'id' | 'name'>;

/** How an organization is shown everywhere it appears: the id first, then its name in parens. */
export function formatOrgLabel(id: string, name?: string): string {
	return name ? `${id} (${name})` : id;
}

/**
 * Upper bound on the picker's options. The MultiSelect renders every option as a DOM node with no
 * virtualization, so this caps the payload and the node count rather than growing 1:1 with the org
 * table. Raise it (or move to server-side `name=ct=` filtering, as the paginated admin org list
 * does) if organizations ever exceed this.
 */
export const ORGANIZATION_PICKER_LIMIT = 500;

/**
 * GET /Admin/Organization → organizations for the region form's customer scope picker (super-user
 * only). Terminated orgs keep a DELETED row, so they're filtered out — scoping a region to one is
 * meaningless. The response is cast down to the two fields the picker uses.
 */
export async function getOrganizations(): Promise<AdminOrganizationSummary[]> {
	// Trailing slash required to get the records array rather than the collection descriptor.
	const query = ['status=ne=DELETED', 'sort(name)', `limit(0,${ORGANIZATION_PICKER_LIMIT})`].join('&');
	const { data } = await apiClient.get(`/Admin/Organization/?${query}` as '/Admin/Organization/');
	return data as unknown as AdminOrganizationSummary[];
}

export const organizationsQueryKey = ['fabric-admin', 'organizations'];

export function getOrganizationsQueryOptions() {
	return queryOptions({
		queryKey: organizationsQueryKey,
		queryFn: getOrganizations,
		retry: false,
	});
}
