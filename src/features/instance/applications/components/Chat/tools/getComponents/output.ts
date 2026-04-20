import type { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import type { FileEntry } from '@/features/instance/applications/context/fileEntry';
import type { TreeItem } from 'react-complex-tree';

export interface Output {
	success: boolean;
	message?: string;
	items?: Record<string, TreeItem<DirectoryEntry | FileEntry | undefined>>;
}
