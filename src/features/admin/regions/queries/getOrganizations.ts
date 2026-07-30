import { apiClient } from '@/config/apiClient';
import { SchemaOrganization } from '@/integrations/api/api.gen';
import { queryOptions } from '@tanstack/react-query';

/** Just what the org picker needs; the endpoint returns full organization records. */
export type AdminOrganizationSummary = Pick<SchemaOrganization, 'id' | 'name'>;

/** How an organization is shown everywhere it appears: the id first, then its name in parens. */
export function formatOrgLabel(id: string, name?: string): string {
	return name ? `${id} (${name})` : id;
}

/** Rows per request while sweeping the org table. */
export const ORGANIZATION_PAGE_SIZE = 500;

/**
 * Hard stop on the sweep, so a server that keeps returning full pages can't spin forever. Hitting it
 * is reported rather than swallowed — past this point the picker is missing orgs and the list page
 * can't name them.
 */
export const ORGANIZATION_PAGE_LIMIT = 40;

export interface AdminOrganizationsResult {
	organizations: AdminOrganizationSummary[];
	/** True when {@link ORGANIZATION_PAGE_LIMIT} cut the sweep short of the whole table. */
	truncated: boolean;
}

/**
 * GET /Admin/Organization → every organization, for the region form's customer scope picker and the
 * list page's id→name lookup (super-user only). Terminated orgs keep a DELETED row, so they're
 * filtered out — scoping a region to one is meaningless.
 *
 * Both callers need the complete set: a single capped request would silently make orgs past the cap
 * unassignable AND leave already-scoped ones rendering as bare ids, so this pages until the server
 * returns a short page. Harper collections carry no total count, so a short page is the only
 * end-of-table signal.
 */
export async function getOrganizations(): Promise<AdminOrganizationsResult> {
	const organizations: AdminOrganizationSummary[] = [];
	for (let page = 0; page < ORGANIZATION_PAGE_LIMIT; page++) {
		const start = page * ORGANIZATION_PAGE_SIZE;
		const query = [
			'status=ne=DELETED',
			'sort(name)',
			`limit(${start},${start + ORGANIZATION_PAGE_SIZE})`,
		].join('&');
		// Trailing slash required to get the records array rather than the collection descriptor.
		const { data } = await apiClient.get(`/Admin/Organization/?${query}` as '/Admin/Organization/');
		const rows = data as unknown as AdminOrganizationSummary[];
		organizations.push(...rows);
		if (rows.length < ORGANIZATION_PAGE_SIZE) {
			return { organizations, truncated: false };
		}
	}
	return { organizations, truncated: true };
}

export const organizationsQueryKey = ['fabric-admin', 'organizations'];

export function getOrganizationsQueryOptions() {
	return queryOptions({
		queryKey: organizationsQueryKey,
		queryFn: getOrganizations,
		retry: false,
	});
}
