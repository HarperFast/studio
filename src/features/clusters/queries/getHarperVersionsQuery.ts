import { apiClient } from '@/config/apiClient';
import { queryOptions } from '@tanstack/react-query';

export interface HarperVersionsResponse {
	name: string;
	description: string;
	value: HarperVersion[];
}

export interface HarperVersion {
	/**
	 * Release tag for this version. `stable`, `next`, `beta`, and `alpha` come from the endpoint (which may
	 * also return tags we don't know about yet, hence the plain `string`); `current` is synthesized
	 * client-side for the version a cluster already runs.
	 */
	name: string;
	version: string;
}

/**
 * Known release tags, most-preferred first. When the endpoint returns the same version under more than one
 * tag we keep the most-preferred; any unrecognized tag ranks below all of these.
 */
export const HARPER_VERSION_TAG_PREFERENCE = ['stable', 'next', 'beta', 'alpha'] as const;

function tagRank(name: string): number {
	const index = (HARPER_VERSION_TAG_PREFERENCE as readonly string[]).indexOf(name);
	return index === -1 ? HARPER_VERSION_TAG_PREFERENCE.length : index;
}

/**
 * Collapse versions that share the same version string down to a single entry, keeping the one with the
 * most-preferred tag (stable > next > beta > alpha > anything else). The endpoint can return, e.g.,
 * `5.1.21` tagged both `stable` and `next`; the picker should only offer `stable`.
 */
export function dedupeHarperVersionsByTag(versions: HarperVersion[]): HarperVersion[] {
	const bestByVersion = new Map<string, HarperVersion>();
	for (const version of versions) {
		const existing = bestByVersion.get(version.version);
		if (!existing || tagRank(version.name) < tagRank(existing.name)) {
			// Map preserves first-insertion order, so replacing the value keeps the version's original position.
			bestByVersion.set(version.version, version);
		}
	}
	return [...bestByVersion.values()];
}

async function getHarperVersions(organizationId: string) {
	// TODO: OpenAPI from CM is erroring, so this new endpoint isn't described.
	// The list is org-scoped: enterprise orgs also get the versions currently deployed on their
	// clusters (labeled with the cluster) merged in server-side.
	const { data } = await apiClient.get(`/HarperVersions/` as any, {
		params: { organizationId },
	});
	const response = data as HarperVersionsResponse;
	return {
		...response,
		value: dedupeHarperVersionsByTag(response.value),
	} satisfies HarperVersionsResponse;
}

export function getHarperVersionsOptions(organizationId: string) {
	return queryOptions({
		// Org-first, matching the sibling queries (getPlanTypesQuery, getRegionLocationsQuery, …) so
		// org-scoped invalidations — `queryClient.invalidateQueries({ queryKey: [organizationId] })`,
		// used after cluster ops that can change deployed versions — also refresh this list.
		queryKey: [organizationId, 'HarperVersions'],
		queryFn: () => getHarperVersions(organizationId),
		staleTime: 60_000,
		retry: false,
	});
}
