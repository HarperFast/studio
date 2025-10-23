import type { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import type { FileEntry } from '@/features/instance/applications/context/fileEntry';
import type { TreeItem } from 'react-complex-tree';

export function getItemTitle(item: TreeItem<DirectoryEntry | FileEntry | undefined>): string {
	const data = item.data;
	if (data && 'name' in data) {
		return data.name;
	}
	return 'root';
}
