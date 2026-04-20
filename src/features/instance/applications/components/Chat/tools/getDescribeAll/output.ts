import { InstanceDatabaseMap } from '@/integrations/api/api.patch';

export interface Output {
	success: boolean;
	message?: string;
	map?: InstanceDatabaseMap;
}
