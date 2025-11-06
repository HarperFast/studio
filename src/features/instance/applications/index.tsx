import { ContentActions } from '@/features/instance/applications/components/ContentActions';
import { ContentViewer } from '@/features/instance/applications/components/ContentViewer';
import { AddDirectoryOrFileModal } from '@/features/instance/applications/modals/AddDirectoryOrFileModal';
import { DeleteDirectoryOrFileModal } from '@/features/instance/applications/modals/DeleteDirectoryOrFileModal';
import { RedeployApplicationModal } from '@/features/instance/applications/modals/RedeployApplicationModal';
import { RenameFileModal } from '@/features/instance/applications/modals/RenameFileModal';
import { useSessionToggler } from '@/hooks/useSessionToggler';
import { cx } from 'class-variance-authority';
import { ApplicationsSidebar } from './components/ApplicationsSidebar';
import { EditorViewProvider } from './context/EditorViewProvider';

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

			<div className={cx('overflow-y-auto overflow-x-hidden fixed bottom-0 right-0 left-0 md:left-56' +
				' transition-[left]' +
				' h-[calc(100vh-theme(spacing.32))]', toggled && 'sm:left-56')}>
				<ContentViewer />
				<ContentActions toggledSidebar={toggled} toggleSidebar={toggle} />
			</div>

			<AddDirectoryOrFileModal />
			<DeleteDirectoryOrFileModal />
			<RedeployApplicationModal />
			<RenameFileModal />
		</EditorViewProvider>
	);
}
