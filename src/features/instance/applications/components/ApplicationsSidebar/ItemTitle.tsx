import type { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import type { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { parseFileExtension } from '@/lib/string/parseFileExtension';
import { TreeItem } from 'react-complex-tree';
import { TreeItemRenderContext } from 'react-complex-tree/src/types';
import { DirectoryIcon } from './FileTreeExplorer/DirectoryIcon';
import { FileTypeIcon } from './FileTreeExplorer/FileTypeIcon';
import { LockedIcon } from './FileTreeExplorer/LockedIcon';

export function ItemTitle({ title, item, context }: {
	title: string;
	item: TreeItem<DirectoryEntry | FileEntry | null>,
	context: TreeItemRenderContext
}) {
	return <>
		{
			isDirectory(item.data)
				? <DirectoryIcon
					opened={context.isExpanded}
					pkg={!!item.data?.package || title === 'Imported Applications'} />
				: <FileTypeIcon extension={parseFileExtension(title)} />
		}
		<span className="text-nowrap">{title}</span>
		{item.data?.package && <LockedIcon />}
	</>;
}
