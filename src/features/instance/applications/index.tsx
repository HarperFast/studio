import { useSessionToggler } from '@/hooks/useSessionToggler';
import { cx } from 'class-variance-authority';
import { ApplicationsSidebar } from './components/ApplicationsSidebar';
import { ContentActions } from './components/ContentActions';
import { ContentViewer } from './components/ContentViewer';
import { EditorViewProvider } from './context/EditorViewProvider';
import { AddDirectoryOrFileModal } from './modals/AddDirectoryOrFileModal';
import { DeleteDirectoryOrFileModal } from './modals/DeleteDirectoryOrFileModal';
import { DownloadApplicationModal } from './modals/DownloadApplicationModal';
import { RedeployApplicationModal } from './modals/RedeployApplicationModal';
import { RenameFileModal } from './modals/RenameFileModal';

export function ApplicationsEditor() {
	const { toggle, toggled } = useSessionToggler('ApplicationsSidebarOpened', true);

	return (
		<EditorViewProvider>
			<aside id="file-explorer-sidebar" className={cx(
				'pt-[calc(theme(spacing.32))] w-56 fixed top-0 left-0 bottom-0 z-30',
				'bg-black-dark shadow shadow-black',
				'transition-transform -translate-x-full',
				toggled ? 'translate-x-0' : 'md:translate-x-0',
			)} aria-label="Sidebar">
				<ApplicationsSidebar />
			</aside>

			<div className={cx(
				'applications-content',
				'overflow-y-auto overflow-x-hidden',
				'fixed top-32 right-0 bottom-0 left-0',
				'transition-[left]',
				'md:left-56',
				toggled && 'sm:left-56',
			)}>
				<ContentViewer />
				<ContentActions toggledSidebar={toggled} toggleSidebar={toggle} />
			</div>

			<AddDirectoryOrFileModal />
			<DeleteDirectoryOrFileModal />
			<DownloadApplicationModal />
			<RedeployApplicationModal />
			<RenameFileModal />
		</EditorViewProvider>
	);
}
