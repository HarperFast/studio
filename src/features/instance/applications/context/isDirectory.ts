import { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { APIDirectoryEntry, APIFileEntry } from '@/integrations/api/instance/applications/getComponents';

export function isDirectory(entry: DirectoryEntry | FileEntry | undefined): entry is DirectoryEntry;
export function isDirectory(entry: APIDirectoryEntry | APIFileEntry | undefined): entry is APIDirectoryEntry;
export function isDirectory(entry: DirectoryEntry | FileEntry | APIDirectoryEntry | APIFileEntry | undefined) {
	return Boolean((entry as DirectoryEntry)?.entries);
}
