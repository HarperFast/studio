import { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import { FileEntry } from '@/features/instance/applications/context/fileEntry';

export function isDirectory(entry: DirectoryEntry | FileEntry | null): entry is DirectoryEntry {
	return Boolean((entry as DirectoryEntry)?.entries);
}
