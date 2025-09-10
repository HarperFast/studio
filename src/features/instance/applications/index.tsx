import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { EditorViewProvider } from '@/features/instance/applications/context/EditorViewProvider';
import { ApplicationsSidebar } from '@/features/instance/applications/components/ApplicationsSidebar';
import { getComponentsQueryOptions } from '@/features/instance/operations/queries/getComponents';
import { useSuspenseQuery } from '@tanstack/react-query';
import { TextEditorView } from './components/TextEditorView';

export function ApplicationsEditor() {
	const instanceParams = useInstanceClientIdParams();
	const { data: getComponentsQueryData } = useSuspenseQuery(getComponentsQueryOptions(instanceParams));

	return (
		<EditorViewProvider>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-12 h-[calc(100vh-theme(spacing.40))]">
				<section className="col-span-1 overflow-y-scroll min-h-48 text-white md:col-span-4 lg:col-span-3">
					<ApplicationsSidebar fileTreeQueryData={getComponentsQueryData} />
				</section>
				<section className="col-span-1 text-white md:col-span-8 lg:col-span-9">
					<TextEditorView />
				</section>
			</div>
		</EditorViewProvider>
	);
}
