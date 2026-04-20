import { GetComponentFileResponse } from '@/integrations/api/instance/applications/getComponentFile';

export interface Output {
	success: boolean;
	message?: string;
	data?: GetComponentFileResponse;
}
