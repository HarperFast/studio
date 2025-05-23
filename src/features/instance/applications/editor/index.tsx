import { Editor } from '@monaco-editor/react';
import ApplicationsSidebar from '@/features/instance/applications/editor/components/ApplicationsSidebar';

function EditApplications() {
	return (
		<main className="grid grid-cols-1 gap-4 md:grid-cols-12">
			<section className="col-span-1 text-white md:col-span-4 lg:col-span-3">
				<ApplicationsSidebar />
			</section>
			<section className="col-span-1 text-white md:col-span-8 lg:col-span-9">
				<Editor className="w-full h-96" language="json" theme="vs-dark" />
			</section>
		</main>
	);
}

export default EditApplications;
