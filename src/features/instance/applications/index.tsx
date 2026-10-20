import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { useSessionToggler } from '@/hooks/useSessionToggler';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { Navigate, useParams } from '@tanstack/react-router';
import { cx } from 'class-variance-authority';
import { ApplicationsSidebar } from './components/ApplicationsSidebar';
import { SidebarResizeHandle } from './components/ApplicationsSidebar/SidebarResizeHandle';
import { ContentActions } from './components/ContentActions';
import { ContentViewer } from './components/ContentViewer';
import { EditorViewProvider } from './context/EditorViewProvider';
import { useResizableApplicationsSidebar } from './hooks/useResizableApplicationsSidebar';
import { AddDirectoryOrFileModal } from './modals/AddDirectoryOrFileModal';
import { DeleteDirectoryOrFileModal } from './modals/DeleteDirectoryOrFileModal';
import { DownloadApplicationModal } from './modals/DownloadApplicationModal';
import { OverwriteConfirmModal } from './modals/OverwriteConfirmModal';
import { RedeployApplicationModal } from './modals/RedeployApplicationModal';
import { RenameFileModal } from './modals/RenameFileModal';

export function ApplicationsEditor() {
	const canManage = useInstanceManagePermission();
	const params = useParams({ strict: false });
	const { toggle, toggled } = useSessionToggler('ApplicationsSidebarOpened', true);
	// The tray width is a CSS variable, on both the tray and the content pane, so the existing
	// responsive/collapse classes (which can't be expressed inline) keep working while it is dynamic.
	const { width, minWidth, maxWidth, isResizing, sidebarRef, startResizing, handleKeyDown } =
		useResizableApplicationsSidebar();

	if (!canManage) {
		return <Navigate to={buildAbsoluteLinkToPage(params, 'databases')} />;
	}

	return (
		<EditorViewProvider>
			<aside
				id="file-explorer-sidebar"
				ref={sidebarRef}
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
				<SidebarResizeHandle
					width={width}
					minWidth={minWidth}
					maxWidth={maxWidth}
					isResizing={isResizing}
					onPointerDown={startResizing}
					onKeyDown={handleKeyDown}
				/>
			</aside>

			<div
				ref={sidebarRef}
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
			<DeleteDirectoryOrFileModal />
			<DownloadApplicationModal />
			<RedeployApplicationModal />
			<RenameFileModal />
			<OverwriteConfirmModal />
		</EditorViewProvider>
	);
}
