import { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { APIDirectoryEntry, APIFileEntry } from '@/features/instance/operations/queries/getComponents';

export function isDirectory(entry: DirectoryEntry | FileEntry | undefined): entry is DirectoryEntry;
export function isDirectory(entry: APIDirectoryEntry | APIFileEntry | undefined): entry is APIDirectoryEntry;
export function isDirectory(entry: DirectoryEntry | FileEntry | APIDirectoryEntry | APIFileEntry | undefined) {
	return Boolean((entry as DirectoryEntry)?.entries);
}
