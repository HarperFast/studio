import { createInstanceLayoutRoute } from '@/features/instance/instanceLayoutRoute';
import { createRoute } from '@tanstack/react-router';
import { NewApplications } from '@/features/instance/applications/new';
import { ApplicationsEditor } from '@/features/instance/applications/editor';

export function createApplicationsRoutes(instanceLayoutRoute: ReturnType<typeof createInstanceLayoutRoute>) {
	const instanceApplicationsIndexRoute = createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: 'applications',
		component: ApplicationsEditor,
	});

	const instanceApplicationsNewRoute = createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: 'applications/new',
		component: NewApplications,
	});

	return [
		instanceApplicationsIndexRoute,
		instanceApplicationsNewRoute,
		// instanceApplicationsEditorRoute,
	];
}
