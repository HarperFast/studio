import { EditorViewProvider } from '@/features/instance/applications/context/EditorViewProvider';
import { ApplicationsSidebar } from '@/features/instance/applications/editor/components/ApplicationsSidebar';
import { getComponentsQueryOptions } from '@/features/instance/operations/queries/getComponents';
import { getRouteApi } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { TextEditorView } from './components/TextEditorView';
const route = getRouteApi('');

export function EditApplications() {
	const { instanceId } = route.useParams();
	const { data: getComponentsQueryData } = useSuspenseQuery(getComponentsQueryOptions(instanceId));

	return (
		<EditorViewProvider>
			<div className="grid grid-cols-1 gap-4 md:grid-cols-12 h-[calc(100vh-theme(spacing.32))]">
				<section className="h-0 min-h-full col-span-1 overflow-y-scroll text-white md:col-span-4 lg:col-span-3">
					<ApplicationsSidebar fileTreeQueryData={getComponentsQueryData} />
				</section>
				<section className="h-full col-span-1 text-white md:col-span-8 lg:col-span-9">
					<TextEditorView />
				</section>
			</div>
		</EditorViewProvider>
	);
}
