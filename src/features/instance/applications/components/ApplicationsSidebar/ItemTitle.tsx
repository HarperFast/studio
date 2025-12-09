import type { DirectoryEntry } from '@/features/instance/applications/context/directoryEntry';
import { useEditorFileContent } from '@/features/instance/applications/context/editorFileContent';
import type { FileEntry } from '@/features/instance/applications/context/fileEntry';
import { isDirectory } from '@/features/instance/applications/context/isDirectory';
import { parseFileExtension } from '@/lib/string/parseFileExtension';
import { TreeItem } from 'react-complex-tree';
import { TreeItemRenderContext } from 'react-complex-tree/src/types';
import { DirectoryIcon } from './DirectoryIcon';
import { FileTypeIcon } from './FileTypeIcon';
import { LockedIcon } from './LockedIcon';
import { NewApplicationIcon } from './NewApplicationIcon';
import { importedApplications, newApplication } from './specialItems';

export function ItemTitle({ title, item, context }: {
	title: string;
	item: TreeItem<DirectoryEntry | FileEntry | undefined>;
	context: TreeItemRenderContext;
}) {
	const { content } = useEditorFileContent(item.data?.path);
	return (
		<>
			{item.data?.path === newApplication
				? <NewApplicationIcon />
				: isDirectory(item.data)
				? (
					<DirectoryIcon
						opened={context.isExpanded}
						pkg={!!item.data?.package || item.data.path === importedApplications}
					/>
				)
				: <FileTypeIcon extension={parseFileExtension(title)} />}
			<span className="text-nowrap pointer-events-none">{title}{content ? '*' : ''}</span>
			{item.data?.package && <LockedIcon />}
		</>
	);
}
