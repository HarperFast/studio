// @vitest-environment jsdom
import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { type AnalyticsContextValue, AnalyticsProvider } from '../../context/AnalyticsContext.tsx';
import type { AnalyticsDataPoint } from '../../types/analytics.ts';

export function makeInstanceParams(): InstanceClientIdConfig & InstanceTypeConfig {
	return {
		instanceClient: { post: async () => ({ data: [] }) } as never,
		entityId: 'test-instance' as never,
		entityType: 'instance',
	};
}

export function makeContextValue(overrides: Partial<AnalyticsContextValue> = {}): AnalyticsContextValue {
	return {
		timeRange: { startTime: 0, endTime: 60_000 },
		bucketMs: 60_000,
		theme: 'light',
		instanceParams: makeInstanceParams(),
		...overrides,
	};
}

export function AnalyticsTestWrapper({ children }: { children: ReactNode }) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: Infinity } },
	});
	return (
		<QueryClientProvider client={client}>
			<AnalyticsProvider value={makeContextValue()}>{children}</AnalyticsProvider>
		</QueryClientProvider>
	);
}

/** Synthetic Harper rows that satisfy the most-common spec field needs:
 *  - count, mean, period (every aggregator + period-field bucketing)
 *  - p50/p95/p99 (duration / db-* / transfer)
 *  - id (table-size / database-size / storage-volume timestamp mode) */
export function makeRows(node = 'n1'): AnalyticsDataPoint[] {
	return [
		{ id: 1_000, time: 1_000, node, count: 5, mean: 0.5, period: 60, p50: 1, p95: 5, p99: 9 },
		{ id: 2_000, time: 2_000, node, count: 7, mean: 0.7, period: 60, p50: 2, p95: 6, p99: 10 },
	];
}
