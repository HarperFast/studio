import EmptyApplicationsView from '@/features/instance/applications/editor/components/ApplicationsSidebar/EmptyApplicationsView';
import FileBrowser from './FileBrowser';
import { GetComponentsResponse } from '@/features/instance/operations/queries/getComponents';

function ApplicationsSidebar({ fileTreeQueryData }: { fileTreeQueryData?: GetComponentsResponse }) {
	// console.log('ApplicationsSidebar fileTreeQueryData', fileTreeQueryData);
	if (!fileTreeQueryData || !fileTreeQueryData.entries.length) {
		return <EmptyApplicationsView />;
	}

	return (
		<>
			<FileBrowser files={fileTreeQueryData} />
		</>
	);
}
export default ApplicationsSidebar;
