import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { useSessionToggler } from '@/hooks/useSessionToggler';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { Navigate, useParams } from '@tanstack/react-router';
import { cx } from 'class-variance-authority';
import { ApplicationsSidebar } from './components/ApplicationsSidebar';
import { SidebarResizeHandle, useResizableSidebar } from './components/ApplicationsSidebar/SidebarResizeHandle';
import { ContentActions } from './components/ContentActions';
import { ContentViewer } from './components/ContentViewer';
import { EditorViewProvider } from './context/EditorViewProvider';
import { AddDirectoryOrFileModal } from './modals/AddDirectoryOrFileModal';
import { DeleteDirectoryOrFileModal } from './modals/DeleteDirectoryOrFileModal';
import { DownloadApplicationModal } from './modals/DownloadApplicationModal';
import { NewTableModal } from './modals/NewTableModal';
import { OverwriteConfirmModal } from './modals/OverwriteConfirmModal';
import { RedeployApplicationModal } from './modals/RedeployApplicationModal';
import { RenameFileModal } from './modals/RenameFileModal';

export function ApplicationsEditor() {
	const canManage = useInstanceManagePermission();
	const params = useParams({ strict: false });
	const { toggle, toggled } = useSessionToggler('ApplicationsSidebarOpened', true);
	const { width, isResizing, startResizing } = useResizableSidebar();

	if (!canManage) {
		return <Navigate to={buildAbsoluteLinkToPage(params, 'databases')} />;
	}

	// Drive the tray width through a CSS variable so the existing responsive/collapse
	// classes (which can't be expressed inline) keep working while the width is dynamic.
	const sidebarWidthVar = { '--app-sidebar-width': `${width}px` } as React.CSSProperties;

	return (
		<EditorViewProvider>
			<aside
				id="file-explorer-sidebar"
				style={sidebarWidthVar}
				className={cx(
					'pt-[calc(--spacing(32))] w-[var(--app-sidebar-width)] fixed top-0 left-0 bottom-0 z-30',
					'bg-violet-50 border-r border-violet-200 shadow shadow-black/10',
					'dark:bg-grey-700 dark:border-grey-600 dark:shadow-black',
					'transition-transform -translate-x-full',
					toggled ? 'translate-x-0' : 'md:translate-x-0',
				)}
				aria-label="Sidebar"
			>
				<ApplicationsSidebar />
				<SidebarResizeHandle isResizing={isResizing} onMouseDown={startResizing} />
			</aside>

			<div
				style={sidebarWidthVar}
				className={cx(
					'applications-content',
					'overflow-y-auto overflow-x-hidden',
					'fixed top-32 right-0 bottom-0 left-0',
					!isResizing && 'transition-[left]',
					'md:left-[var(--app-sidebar-width)]',
					toggled && 'sm:left-[var(--app-sidebar-width)]',
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
			<OverwriteConfirmModal />
		</EditorViewProvider>
	);
}
