import { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { APIDirectoryEntry } from '@/integrations/api/instance/applications/getComponents';

export interface DirectoryEntry extends APIDirectoryEntry, FileEntry {
	entries: Array<DirectoryEntry | FileEntry>;
	overviewEntry?: FileEntry;
}
