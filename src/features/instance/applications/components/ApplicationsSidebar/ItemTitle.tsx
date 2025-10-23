import {
	NewApplicationIcon,
} from '@/features/instance/applications/components/ApplicationsSidebar/FileTreeExplorer/NewApplicationIcon';
import {
	importedApplications,
	newApplication,
} from '@/features/instance/applications/components/ApplicationsSidebar/specialItems';
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
			item.data?.path === newApplication
				? <NewApplicationIcon />
				: isDirectory(item.data)
					? <DirectoryIcon
						opened={context.isExpanded}
						pkg={!!item.data?.package || item.data.path === importedApplications} />
					: <FileTypeIcon extension={parseFileExtension(title)} />
		}
		<span className="text-nowrap">{title}</span>
		{item.data?.package && <LockedIcon />}
	</>;
}
