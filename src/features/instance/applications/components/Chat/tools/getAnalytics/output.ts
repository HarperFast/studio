import type { AnalyticsDataPoint } from '@/features/instance/status/analytics/types/analytics';

export interface Output {
	success: boolean;
	message?: string;
	data?: AnalyticsDataPoint[];
}
