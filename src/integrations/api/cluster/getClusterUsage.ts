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

export interface UsageRateLimits {
	readsPerMinute: number | null;
	readsPerMinuteBytes: number | null;
	writesPerMinute: number | null;
	writesPerMinuteBytes: number | null;
	realTimeDeliveriesPerMinute: number | null;
	realTimeDeliveryBytesPerMinute: number | null;
	tlsHandshakes: number | null;
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

/** "Standard plan · renews Aug 12" — shared by the card + tab. */
export function usageSubtitle(data: ClusterUsage): string {
	const planName = data.regions[0]?.planName;
	return [
		planName ? `${planName} plan` : null,
		data.renewsAt ? `renews ${formatCycleDate(data.renewsAt)}` : null,
	].filter(Boolean).join(' · ');
}

function formatCycleDate(iso: string): string {
	return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(iso));
}
