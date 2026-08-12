import { apiClient } from '@/config/apiClient';
import { queryOptions, useQuery } from '@tanstack/react-query';

// Response of central-manager's GET /Cluster/:id/usage (HarperFast/central-manager#503).
// Quota is enforced per region, so per-region `metrics` are the real meters; `totals` carries absolute
// consumption only (no cluster-wide ceiling), and `mostConstrained` is the single tightest region×metric.

export interface UsageValue {
	used: number;
	/** null when `unlimited` OR `!limitKnown` */
	limit: number | null;
	/** plan grants no ceiling (server sentinel -1) */
	unlimited: boolean;
	/** false when the plan couldn't be resolved — render "—", never "Unlimited" */
	limitKnown: boolean;
}

export interface UsageMetrics {
	reads: UsageValue;
	readBytes: UsageValue;
	writes: UsageValue;
	writeBytes: UsageValue;
	realTimeMessages: UsageValue;
	realTimeBytes: UsageValue;
	cpuTimeHours: UsageValue;
	storageBytes: UsageValue;
}

export type UsageMetricKey = keyof UsageMetrics;

/**
 * One throughput ceiling, in the same three states the metered values carry: a finite `value`,
 * `unlimited` (the plan grants no ceiling), or `!known` — the endpoint couldn't determine it, rendered
 * "—". Never a sentinel: the -1 the unlimited plans store is resolved server-side.
 */
export interface UsageRateLimit {
	value: number | null;
	unlimited: boolean;
	known: boolean;
}

/**
 * EFFECTIVE per-region ceilings, not a copy of the plan row: the endpoint resolves the -1 sentinel and
 * scales the tier-dependent ceilings (reads, read bandwidth, real-time, TLS) by the region's purchased
 * block multiplier, so these are the region's real numbers rather than one block's. `null` means the
 * plan declares no such ceiling, and the UI drops the row instead of inventing one.
 *
 * A server that predates that normalization sends bare numbers here; with no `known`/`unlimited` flags
 * to trust they render as "—", never as a real (understated) ceiling. See `rateRowsFrom`.
 */
export interface UsageRateLimits {
	readsPerMinute: UsageRateLimit | null;
	readsPerMinuteBytes: UsageRateLimit | null;
	writesPerMinute: UsageRateLimit | null;
	writesPerMinuteBytes: UsageRateLimit | null;
	realTimeDeliveriesPerMinute: UsageRateLimit | null;
	realTimeDeliveryBytesPerMinute: UsageRateLimit | null;
	tlsHandshakes: UsageRateLimit | null;
}

export interface UsageResourcesPerInstance {
	storageGb?: number | null;
	memoryMb?: number | null;
	cpuCores?: number | null;
	threads?: number | null;
	readIopsLimit?: number | null;
	writeIopsLimit?: number | null;
}

export interface ClusterUsageRegion {
	region: string | null;
	regionIds: string[];
	planId: string | null;
	planName: string | null;
	planLevel: number | null;
	expiresAt: string | null;
	/** active = live quota; exhausted = burned through (re-billing); lapsed = expired/not-renewed */
	status: 'active' | 'exhausted' | 'lapsed';
	activeBlockCount: number;
	metrics: UsageMetrics;
	rateLimits: UsageRateLimits | null;
	resourcesPerInstance: UsageResourcesPerInstance | null;
}

/** Absolute consumption summed across regions — no ceiling of any kind. */
export type UsageTotals = Record<UsageMetricKey, { used: number }>;

export interface MostConstrained {
	metric: UsageMetricKey;
	region: string | null;
	regionIds: string[];
	used: number;
	limit: number;
	utilization: number;
}

export interface ClusterUsage {
	clusterId: string;
	selfManaged: boolean;
	renewsAt: string | null;
	totals: UsageTotals | null;
	mostConstrained: MostConstrained | null;
	regions: ClusterUsageRegion[];
}

export function getClusterUsageQueryOptions(clusterId?: string) {
	return queryOptions({
		queryKey: ['clusterUsage', clusterId],
		queryFn: async (): Promise<ClusterUsage> => {
			// Not in the generated OpenAPI types yet (sub-path of /Cluster/{id}); typed by hand above.
			const { data } = await apiClient.get(`/Cluster/${clusterId}/usage` as never);
			return data as ClusterUsage;
		},
		enabled: !!clusterId,
		// Usage lags to the instance-reporting cadence, so it doesn't need to be fresh-to-the-second.
		staleTime: 60_000,
	});
}

export function useClusterUsage(clusterId?: string) {
	return useQuery(getClusterUsageQueryOptions(clusterId));
}

/**
 * "Standard plan · renews Aug 12" — the cluster-wide summary line above the overview meters.
 *
 * Neither fact is cluster-wide unless the regions agree on it: a cluster can run a different current plan
 * per region, and `renewsAt` is the EARLIEST expiry among the active ones. So the plan is named only when
 * every region names the same one, and with more than one region the date is labelled "next renewal"
 * rather than asserting the whole cluster renews then. The per-region truth is on the Usage tab.
 */
export function usageSubtitle(data: ClusterUsage): string {
	const { regions } = data;
	const uniformPlanName = regions.every((r) => r.planName === regions[0]?.planName) ? regions[0]?.planName : null;
	const renewal = regions.length > 1 ? 'next renewal' : 'renews';
	return [
		uniformPlanName ? `${uniformPlanName} plan` : null,
		data.renewsAt ? `${renewal} ${formatCycleDate(data.renewsAt)}` : null,
	].filter(Boolean).join(' · ');
}

function formatCycleDate(iso: string): string {
	return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(iso));
}
