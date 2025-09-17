import { GetComponentsResponse } from '@/features/instance/operations/queries/getComponents';
import { FileTreeExplorer } from './FileTreeExplorer';
import { FileMenuActionButtons } from './FileTreeExplorer/FileMenuActionButtons';

export function ApplicationsSidebar({ fileTreeQueryData }: { fileTreeQueryData: GetComponentsResponse }) {
	return (
		<>
			<FileMenuActionButtons />
			<FileTreeExplorer files={fileTreeQueryData} />
		</>
	);
}
