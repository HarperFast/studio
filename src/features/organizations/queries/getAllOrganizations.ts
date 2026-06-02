import { apiClient } from '@/config/apiClient';
import { Organization } from '@/integrations/api/api.patch';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';

// Server-side page size for the fabric admin "all organizations" view. Sized
// to roughly one screen of cards: full rows at every breakpoint (3 per row at
// md, 4 at lg, 6 at 2xl).
export const ALL_ORGANIZATIONS_PAGE_SIZE = 12;

export interface AllOrganizationsPage {
	organizations: Organization[];
	hasNextPage: boolean;
}

/**
 * Builds the Harper REST query for one page of the admin organization list.
 * Harper collections return a bare array (no total count), so we request one
 * record past the page boundary to learn whether a next page exists.
 */
export function buildAllOrganizationsUrl(pageIndex: number, nameFilter: string): string {
	const start = pageIndex * ALL_ORGANIZATIONS_PAGE_SIZE;
	const conditions = [
		// The name filter must precede the status condition: with status first,
		// the API ignores the name condition entirely.
		...(nameFilter ? [`name=ct=${encodeURIComponent(nameFilter)}`] : []),
		// Terminated organizations stick around with status DELETED; hide them.
		'status=ne=DELETED',
		'sort(name)',
		`limit(${start},${start + ALL_ORGANIZATIONS_PAGE_SIZE + 1})`,
	];
	return `/Admin/Organization/?${conditions.join('&')}`;
}

export async function getAllOrganizations(pageIndex: number, nameFilter: string): Promise<AllOrganizationsPage> {
	const { data } = await apiClient.get(buildAllOrganizationsUrl(pageIndex, nameFilter) as '/Organization/');
	return {
		organizations: data.slice(0, ALL_ORGANIZATIONS_PAGE_SIZE),
		hasNextPage: data.length > ALL_ORGANIZATIONS_PAGE_SIZE,
	};
}

export function getAllOrganizationsQueryOptions(pageIndex: number, nameFilter: string) {
	return queryOptions({
		queryKey: ['admin-all-organizations', nameFilter, pageIndex],
		queryFn: () => getAllOrganizations(pageIndex, nameFilter),
		// Keep the previous page on screen while the next one loads.
		placeholderData: keepPreviousData,
		retry: false,
	});
}
