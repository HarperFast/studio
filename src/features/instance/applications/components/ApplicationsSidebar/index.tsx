import { GetComponentsResponse } from '@/features/instance/operations/queries/getComponents';
import { useInstanceBrowseManagePermission } from '@/hooks/usePermissions';
import { FileTreeExplorer } from './FileTreeExplorer';
import { FileMenuActionButtons } from './FileTreeExplorer/FileMenuActionButtons';

export function ApplicationsSidebar({ fileTreeQueryData }: { fileTreeQueryData: GetComponentsResponse }) {
	const canManageBrowseInstance = useInstanceBrowseManagePermission();
	return (
		<>
			{canManageBrowseInstance && (<FileMenuActionButtons />)}
			<FileTreeExplorer files={fileTreeQueryData} />
		</>
	);
}
