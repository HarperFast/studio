import { EmptyApplicationsView } from '@/features/instance/applications/editor/components/ApplicationsSidebar/EmptyApplicationsView';
import { FileTreeExplorer } from '@/features/instance/applications/editor/components/ApplicationsSidebar/FileTreeExplorer';
import { GetComponentsResponse } from '@/features/instance/operations/queries/getComponents';

export function ApplicationsSidebar({ fileTreeQueryData }: { fileTreeQueryData?: GetComponentsResponse }) {
	if (!fileTreeQueryData || !fileTreeQueryData.entries.length) {
		return <EmptyApplicationsView />;
	}

	return <FileTreeExplorer files={fileTreeQueryData} />;
}
