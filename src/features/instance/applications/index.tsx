import { AddDirectoryOrFileModal } from '@/features/instance/applications/modals/AddDirectoryOrFileModal';
import { DeleteDirectoryOrFileModal } from '@/features/instance/applications/modals/DeleteDirectoryOrFileModal';
import { RedeployApplicationModal } from '@/features/instance/applications/modals/RedeployApplicationModal';
import { RenameFileModal } from '@/features/instance/applications/modals/RenameFileModal';
import { useToggler } from '@/hooks/useToggler';
import { cx } from 'class-variance-authority';
import { PanelRightCloseIcon, PanelRightOpenIcon } from 'lucide-react';
import { ApplicationsSidebar } from './components/ApplicationsSidebar';
import { TextEditorView } from './components/TextEditorView';
import { EditorViewProvider } from './context/EditorViewProvider';

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
				'pt-[calc(theme(spacing.32))] w-56 h-screen fixed top-0 left-0 z-30',
				'bg-black-dark',
				'transition-transform -translate-x-full',
				toggled ? 'translate-x-0' : 'md:translate-x-0',
			)} aria-label="Sidebar">
				<ApplicationsSidebar />
			</aside>

			<div className={cx('relative transition-all md:ml-56 h-[calc(100vh-theme(spacing.32))] overflow-hidden', toggled && 'sm:ml-56')}>
				<TextEditorView />
			</div>

			<AddDirectoryOrFileModal />
			<DeleteDirectoryOrFileModal />
			<RedeployApplicationModal />
			<RenameFileModal />
		</EditorViewProvider>
	);
}
