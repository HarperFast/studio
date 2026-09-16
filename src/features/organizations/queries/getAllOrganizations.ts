import { apiClient } from '@/config/apiClient';
import { Cluster, Organization } from '@/integrations/api/api.patch';
import { detectEntityId } from '@/lib/string/entityId';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { AxiosError } from 'axios';

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
 *
 * A filter is sent as `search`, which ranks by relevance server-side rather
 * than filtering on a raw substring. The previous `name=ct=` was a
 * case-sensitive match, so `acme` never found "Acme Corporation"; `search`
 * folds case, accents and punctuation and falls back to a semantic match, so
 * `mcdonalds` finds "McDonald & Sons" and `bank` finds the banks.
 *
 * `sort(name)` is therefore only sent when browsing unfiltered — with a search
 * term the order IS the relevance ranking, and the server ignores any sort.
 */
export function buildAllOrganizationsUrl(pageIndex: number, nameFilter: string): string {
	const start = pageIndex * ALL_ORGANIZATIONS_PAGE_SIZE;
	// Trimmed, so a filter of only spaces is unfiltered browsing rather than a
	// search for whitespace: untrimmed it would send `search=%20%20%20` AND drop
	// `sort(name)`, leaving the full list in relevance order for a term that
	// matches nothing in particular.
	const search = nameFilter.trim();
	const conditions = [
		// Kept ahead of the status condition, as the name filter had to be: the
		// server reads `search` independently of position, but the ordering
		// costs nothing and keeps one less thing depending on that detail.
		...(search ? [`search=${encodeURIComponent(search)}`] : []),
		// Terminated organizations stick around with status DELETED; hide them.
		'status=ne=DELETED',
		...(search ? [] : ['sort(name)']),
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

const EMPTY_PAGE: AllOrganizationsPage = { organizations: [], hasNextPage: false };

function isNotFoundError(error: unknown): boolean {
	return error instanceof AxiosError && (error.response?.status === 404 || error.status === 404);
}

/**
 * Fetches a single organization by its exact id, shaped as a one-item page so
 * it can share the admin list's rendering. A missing id (typo, wrong prefix)
 * resolves to an empty page ("No matches found") rather than an error.
 */
export async function getOrganizationByIdPage(organizationId: string): Promise<AllOrganizationsPage> {
	try {
		const { data } = await apiClient.get(
			`/Admin/Organization/${organizationId}` as '/Admin/Organization/{id}',
		);
		return data ? { organizations: [data as Organization], hasNextPage: false } : EMPTY_PAGE;
	} catch (error) {
		if (isNotFoundError(error)) {
			return EMPTY_PAGE;
		}
		throw error;
	}
}

/**
 * Resolves a cluster id to the organization that owns it (a cluster response
 * carries its `organizationId`), then returns that org as a one-item page. An
 * unknown cluster resolves to an empty page.
 */
export async function getOrganizationForClusterPage(clusterId: string): Promise<AllOrganizationsPage> {
	try {
		const { data: cluster } = await apiClient.get(`/Cluster/${clusterId}` as '/Cluster/{id}');
		const organizationId = (cluster as Cluster)?.organizationId;
		// Await so a rejection from the org lookup is caught here, not orphaned.
		return organizationId ? await getOrganizationByIdPage(organizationId) : EMPTY_PAGE;
	} catch (error) {
		if (isNotFoundError(error)) {
			return EMPTY_PAGE;
		}
		throw error;
	}
}

/**
 * Query for the admin organization search. When the search value looks like an
 * organization or cluster id (a lowercase `org-`/`clu-` prefix — see
 * {@link detectEntityId}), it resolves that id server-side instead of running a
 * title/name search, so pasting an id jumps straight to the matching org.
 */
export function getAllOrganizationsQueryOptions(pageIndex: number, searchValue: string) {
	const entity = detectEntityId(searchValue);
	return queryOptions({
		queryKey: ['admin-all-organizations', searchValue, pageIndex],
		queryFn: () => {
			if (entity?.kind === 'organization') {
				return getOrganizationByIdPage(entity.id);
			}
			if (entity?.kind === 'cluster') {
				return getOrganizationForClusterPage(entity.id);
			}
			return getAllOrganizations(pageIndex, searchValue);
		},
		// Keep the previous page on screen while the next one loads.
		placeholderData: keepPreviousData,
		retry: false,
	});
}
