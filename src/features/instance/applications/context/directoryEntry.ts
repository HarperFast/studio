import { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { APIDirectoryEntry } from '@/features/instance/operations/queries/getComponents';

export interface DirectoryEntry extends APIDirectoryEntry, FileEntry {
	entries: Array<DirectoryEntry | FileEntry>;
}
