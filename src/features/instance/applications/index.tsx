import { ContentViewer } from '@/features/instance/applications/components/ContentViewer';
import { AddDirectoryOrFileModal } from '@/features/instance/applications/modals/AddDirectoryOrFileModal';
import { DeleteDirectoryOrFileModal } from '@/features/instance/applications/modals/DeleteDirectoryOrFileModal';
import { RedeployApplicationModal } from '@/features/instance/applications/modals/RedeployApplicationModal';
import { RenameFileModal } from '@/features/instance/applications/modals/RenameFileModal';
import { useToggler } from '@/hooks/useToggler';
import { cx } from 'class-variance-authority';
import { PanelRightCloseIcon, PanelRightOpenIcon } from 'lucide-react';
import { ApplicationsSidebar } from './components/ApplicationsSidebar';
import { EditorViewProvider } from './context/EditorViewProvider';
import { AddSchemaModal } from '@/features/instance/applications/modals/AddSchemaModal';

export function ApplicationsEditor() {
	const { toggle, toggled } = useToggler(true);

	return (
		<EditorViewProvider>
			<button
				onClick={toggle}
				data-drawer-target="file-explorer-sidebar"
				data-drawer-toggle="file-explorer-sidebar"
				aria-controls="file-explorer-sidebar"
				type="button"
				className="fixed top-0 left-0 h-13 z-50 mt-[calc(theme(spacing.20))] inline-flex items-center p-2 text-sm md:hidden focus:outline-none focus:ring-2 text-white hover:text-grey focus:ring-gray-600 rounded-none">
				<span className="sr-only">{toggled ? 'Close' : 'Open'} sidebar</span>
				{toggled ? <PanelRightOpenIcon /> : <PanelRightCloseIcon />}
			</button>

			<aside id="file-explorer-sidebar" className={cx(
				'pt-[calc(theme(spacing.32))] w-56 fixed top-0 left-0 bottom-0 z-30',
				'bg-black-dark shadow shadow-black',
				'transition-transform -translate-x-full',
				toggled ? 'translate-x-0' : 'md:translate-x-0',
			)} aria-label="Sidebar">
				<ApplicationsSidebar />
			</aside>

			<div className={cx('overflow-auto fixed bottom-0 right-0 left-0 md:left-56 transition-[left]' +
				' h-[calc(100vh-theme(spacing.32))]', toggled && 'sm:left-56')}>
				<ContentViewer />
			</div>
			
			<AddDirectoryOrFileModal />
			<AddSchemaModal />
			<DeleteDirectoryOrFileModal />
			<RedeployApplicationModal />
			<RenameFileModal />
		</EditorViewProvider>
	);
}
