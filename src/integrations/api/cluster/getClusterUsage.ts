import { apiClient } from '@/config/apiClient';
import { queryOptions, useQuery } from '@tanstack/react-query';

// Response of central-manager's GET /Cluster/:id/usage (HarperFast/central-manager#503).
// `limit === null` means the plan allows unlimited (server sends -1, or the limit is unknown).

export interface UsageValue {
	used: number;
	limit: number | null;
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
	regionId: string | null;
	region: string | null;
	planId: string | null;
	planName: string | null;
	planLevel: number | null;
	expiresAt: string | null;
	blockCount: number;
	metrics: UsageMetrics;
	rateLimits: UsageRateLimits | null;
	resourcesPerInstance: UsageResourcesPerInstance | null;
}

export interface ClusterUsage {
	clusterId: string;
	selfManaged: boolean;
	asOf: string | null;
	renewsAt: string | null;
	totals: UsageMetrics | null;
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

/** "Standard plan · this cycle renews Aug 12 · updated 4 minutes ago" — shared by the card + tab. */
export function usageSubtitle(data: ClusterUsage): string {
	const planName = data.regions[0]?.planName;
	return [
		planName ? `${planName} plan` : null,
		data.renewsAt ? `this cycle renews ${formatCycleDate(data.renewsAt)}` : null,
		data.asOf ? `updated ${formatAgo(data.asOf)}` : null,
	].filter(Boolean).join(' · ');
}

function formatCycleDate(iso: string): string {
	return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(iso));
}

function formatAgo(iso: string): string {
	const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
	const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
	if (Math.abs(minutes) < 60) { return rtf.format(-minutes, 'minute'); }
	const hours = Math.round(minutes / 60);
	if (Math.abs(hours) < 24) { return rtf.format(-hours, 'hour'); }
	return rtf.format(-Math.round(hours / 24), 'day');
}
