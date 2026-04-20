import type { Metric } from '@/integrations/api/instance/status/getAnalytics';

export interface Output {
	success: boolean;
	message?: string;
	data?: Metric[];
}
