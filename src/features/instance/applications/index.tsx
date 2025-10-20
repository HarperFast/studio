import { ApplicationsSidebar } from './components/ApplicationsSidebar';
import { TextEditorView } from './components/TextEditorView';
import { EditorViewProvider } from './context/EditorViewProvider';

export function ApplicationsEditor() {
	return (
		<EditorViewProvider>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-12 h-[calc(100vh-theme(spacing.40))]">
				<section className="col-span-1 overflow-y-auto min-h-48 text-white md:col-span-4 lg:col-span-3">
					<ApplicationsSidebar />
				</section>
				<section className="col-span-1 text-white md:col-span-8 lg:col-span-9">
					<TextEditorView />
				</section>
			</div>
		</EditorViewProvider>
	);
}
