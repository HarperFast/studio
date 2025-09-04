import { EmptyApplicationsView } from '@/features/instance/applications/components/ApplicationsSidebar/EmptyApplicationsView';
import { FileTreeExplorer } from '@/features/instance/applications/components/ApplicationsSidebar/FileTreeExplorer';
import { GetComponentsResponse } from '@/features/instance/operations/queries/getComponents';
import { FileMenuActionButtons } from './FileTreeExplorer/FileMenuActionButtons';

export function ApplicationsSidebar({ fileTreeQueryData }: { fileTreeQueryData?: GetComponentsResponse }) {
	if (!fileTreeQueryData || !fileTreeQueryData.entries.length) {
		return <EmptyApplicationsView />;
	}

	return (
		<>
			<FileMenuActionButtons />
			<FileTreeExplorer files={fileTreeQueryData} />
		</>
	);
}
