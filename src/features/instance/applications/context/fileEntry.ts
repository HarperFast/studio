import { APIFileEntry } from '@/integrations/api/instance/applications/getComponents';

export interface FileEntry extends APIFileEntry {
	path: string;
	project: string;
	package?: string;
}
