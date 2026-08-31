import { apiClient } from '@/config/apiClient';
import { queryOptions } from '@tanstack/react-query';

/** A cluster's region plan — embedded on the record, not a relationship. */
export interface BillingRegionPlan {
	regionId?: string | null;
	region?: string | null;
	planId: string;
}

export interface BillingCluster {
	id: string;
	name: string;
	status?: string | null;
	organizationId: string;
	organizationName?: string | null;
	createdAt?: string | null;
	plans?: BillingRegionPlan[] | null;
	/** Set when service was withdrawn — a cluster stopped because its plan ended. */
	suspendedReason?: string | null;
}

export interface BillingClustersResult {
	clusters: BillingCluster[];
	/** True when the sweep hit its page ceiling before the end of the table. */
	truncated: boolean;
}

/** Organizations per request while sweeping. */
const ORGANIZATION_PAGE_SIZE = 500;
/** Hard stop, so a server that keeps returning full pages can't spin forever. */
const ORGANIZATION_PAGE_LIMIT = 40;

interface OrganizationWithClusters {
	id: string;
	name?: string;
	clusters?: Array<Omit<BillingCluster, 'organizationId' | 'organizationName'>> | null;
}

/**
 * Every cluster in the fleet, read through the organizations that own them.
 *
 * There is no Admin/Cluster resource, so the org collection's projection is the only admin-wide
 * cluster listing there is — `clusters` is a relationship on Organization, and OrganizationAdmin's
 * own comment confirms the framework resolves a projection through it. The select is kept to the
 * billing fields on purpose: the same projection can reach `clusters{instances{…}}`, which carries
 * instance credentials.
 *
 * Terminated organizations keep a DELETED row and are filtered out, matching the org picker.
 */
export async function getBillingClusters(): Promise<BillingClustersResult> {
	const clusters: BillingCluster[] = [];

	for (let page = 0; page < ORGANIZATION_PAGE_LIMIT; page++) {
		const start = page * ORGANIZATION_PAGE_SIZE;
		const query = [
			'status=ne=DELETED',
			'sort(name)',
			`limit(${start},${start + ORGANIZATION_PAGE_SIZE})`,
			'select(id,name,clusters{id,name,status,createdAt,plans,suspendedReason})',
		].join('&');
		// Trailing slash required to get the records array rather than the collection descriptor.
		const { data } = await apiClient.get(`/Admin/Organization/?${query}` as '/Admin/Organization/');
		const rows = data as unknown as OrganizationWithClusters[];

		for (const org of rows) {
			for (const cluster of org.clusters ?? []) {
				clusters.push({ ...cluster, organizationId: org.id, organizationName: org.name });
			}
		}

		if (rows.length < ORGANIZATION_PAGE_SIZE) {
			return { clusters, truncated: false };
		}
	}

	return { clusters, truncated: true };
}

export const billingClustersQueryKey = ['fabric-admin', 'billing-clusters'];

export function getBillingClustersQueryOptions() {
	return queryOptions({
		queryKey: billingClustersQueryKey,
		queryFn: getBillingClusters,
		retry: false,
	});
}
