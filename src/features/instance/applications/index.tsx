import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { useSessionToggler } from '@/hooks/useSessionToggler';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { Navigate, useParams } from '@tanstack/react-router';
import { cx } from 'class-variance-authority';
import { ApplicationsSidebar } from './components/ApplicationsSidebar';
import { ContentActions } from './components/ContentActions';
import { ContentViewer } from './components/ContentViewer';
import { EditorViewProvider } from './context/EditorViewProvider';
import { AddDirectoryOrFileModal } from './modals/AddDirectoryOrFileModal';
import { DeleteDirectoryOrFileModal } from './modals/DeleteDirectoryOrFileModal';
import { DownloadApplicationModal } from './modals/DownloadApplicationModal';
import { NewTableModal } from './modals/NewTableModal';
import { RedeployApplicationModal } from './modals/RedeployApplicationModal';
import { RenameFileModal } from './modals/RenameFileModal';

export function ApplicationsEditor() {
	const canManage = useInstanceManagePermission();
	const params = useParams({ strict: false });
	const { toggle, toggled } = useSessionToggler('ApplicationsSidebarOpened', true);

	if (!canManage) {
		return <Navigate to={buildAbsoluteLinkToPage(params, 'databases')} />;
	}

	return (
		<EditorViewProvider>
			<aside
				id="file-explorer-sidebar"
				className={cx(
					'pt-[calc(--spacing(32))] w-56 fixed top-0 left-0 bottom-0 z-30',
					'bg-sidebar shadow shadow-black/20 dark:bg-black-dark dark:shadow-black',
					'transition-transform -translate-x-full',
					toggled ? 'translate-x-0' : 'md:translate-x-0',
				)}
				aria-label="Sidebar"
			>
				<ApplicationsSidebar />
			</aside>

			<div
				className={cx(
					'applications-content',
					'overflow-y-auto overflow-x-hidden',
					'fixed top-32 right-0 bottom-0 left-0',
					'transition-[left]',
					'md:left-56',
					toggled && 'sm:left-56',
				)}
			>
				<ContentViewer />
				<ContentActions toggledSidebar={toggled} toggleSidebar={toggle} />
			</div>

			<AddDirectoryOrFileModal />
			<NewTableModal />
			<DeleteDirectoryOrFileModal />
			<DownloadApplicationModal />
			<RedeployApplicationModal />
			<RenameFileModal />
		</EditorViewProvider>
	);
}
