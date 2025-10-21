import { PanelLeftIcon } from 'lucide-react';
import { ApplicationsSidebar } from './components/ApplicationsSidebar';
import { TextEditorView } from './components/TextEditorView';
import { EditorViewProvider } from './context/EditorViewProvider';

export function ApplicationsEditor() {
	return (
		<EditorViewProvider>
			<button
				data-drawer-target="default-sidebar"
				data-drawer-toggle="default-sidebar"
				aria-controls="default-sidebar"
				type="button"
				className="inline-flex items-center p-2 mt-2 ms-3 text-sm text-gray-500 rounded-lg md:hidden hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:text-gray-400 dark:hover:bg-gray-700 dark:focus:ring-gray-600">
				<span className="sr-only">Open sidebar</span>
				<PanelLeftIcon />
			</button>

			<aside id="default-sidebar" className="pt-[calc(theme(spacing.32))] w-56 fixed top-0 left-0 h-screen transition-transform -translate-x-full sm:translate-x-0" aria-label="Sidebar">
				<div className="h-full overflow-y-auto">
					<ApplicationsSidebar />
				</div>
			</aside>

			<div className="sm:ml-48">
				<TextEditorView />
			</div>
		</EditorViewProvider>
	);
}
