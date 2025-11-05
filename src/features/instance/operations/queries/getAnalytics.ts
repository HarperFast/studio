import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig.ts';
import { queryOptions } from '@tanstack/react-query';
import type { Units } from '@/lib/units';

export type MetricDataKey = string | ((metric: Metric) => number);
export type MetricUnits = Units | 'reads' | 'writes' | 'messages';
export interface MetricConfig {
	id: string;
	name: string;
	label?: string;
	dataKey: MetricDataKey;
	aggregator: (accumulator: number, current: number) => number;
	units: MetricUnits;
	path?: string;
}

interface GetAnalyticsParams {
	metricConfig: MetricConfig;
	startTime: number;
	endTime: number;
	instanceParams: InstanceClientIdConfig & InstanceTypeConfig;
}

interface GetAnalyticsRequest {
	operation: 'get_analytics';
	metric: string;
	start_time: number;
	end_time: number;
	conditions?: {
		attribute: string;
		value: string|number|boolean;
		comparator?: string;
	}[];
}

export interface Metric {
	id: number;
	metric: string;
	count: number;
	mean: number;
	period: number;
	node: string;
	[key: string]: string|number|boolean|null;
}

type GetAnalyticsResponse = Metric[];

export function getAnalyticsQueryOptions({ metricConfig, startTime, endTime, instanceParams }: GetAnalyticsParams) {
	return queryOptions({
		queryKey: ['get_analytics', metricConfig.name, metricConfig.path, startTime, endTime] as const,
		queryFn: async () => {
			const req: GetAnalyticsRequest = {
				operation: 'get_analytics',
				metric: metricConfig.name,
				start_time: startTime,
				end_time: endTime,
			}
			if (metricConfig.path) {
				req.conditions = [{ attribute: 'path', value: metricConfig.path }];
			}
			const { data } = await instanceParams.instanceClient.post<GetAnalyticsResponse>('/', req);
			return data;
		}
	});
}
