import { Editor } from '@monaco-editor/react';
import { ApplicationsSidebar } from '@/features/instance/applications/editor/components/ApplicationsSidebar';
import { getComponentsQueryOptions } from '@/features/instance/operations/queries/getComponents';
import { getRouteApi } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';

const route = getRouteApi('');

export function EditApplications() {
	const { instanceId } = route.useParams();
	const { data: getComponentsQueryData } = useSuspenseQuery(getComponentsQueryOptions(instanceId));

	return (
		<main className="grid grid-cols-1 gap-4 md:grid-cols-12">
			<section className="overflow-y-scroll text-white h-col-span-1 md:col-span-4 lg:col-span-3">
				<ApplicationsSidebar fileTreeQueryData={getComponentsQueryData} />
			</section>
			<section className="col-span-1 text-white md:col-span-8 lg:col-span-9">
				<Editor className="w-full h-96" language="json" theme="vs-dark" />
			</section>
		</main>
	);
}
