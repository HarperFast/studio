import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';

export interface Output {
	success: boolean;
	message?: string;
	data?: ReadLogItem[];
}
