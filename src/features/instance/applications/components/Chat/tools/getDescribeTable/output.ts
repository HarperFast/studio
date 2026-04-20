import { InstanceTable } from '@/integrations/api/api.patch';

export interface Output {
	success: boolean;
	message?: string;
	data?: InstanceTable;
}
