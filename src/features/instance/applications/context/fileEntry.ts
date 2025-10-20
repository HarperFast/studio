import { APIFileEntry } from '@/features/instance/operations/queries/getComponents';

export interface FileEntry extends APIFileEntry {
	path: string;
	project: string;
	package?: string;
}
