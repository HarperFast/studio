import { InsertTableRecordsResponse } from '@/integrations/api/instance/database/insertTableRecords';

export interface Output {
	success: boolean;
	message?: string;
	data?: InsertTableRecordsResponse;
}
