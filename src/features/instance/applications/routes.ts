import { createInstanceLayoutRoute } from '@/features/instance/instanceLayoutRoute';
import { createRoute } from '@tanstack/react-router';
import { ApplicationsIndex } from '@/features/instance/applications/index';
import { NewApplications } from '@/features/instance/applications/new';
import { EditApplications } from '@/features/instance/applications/editor';

export function createApplicationsRoutes(instanceLayoutRoute: ReturnType<typeof createInstanceLayoutRoute>) {
	const instanceApplicationsIndexRoute = createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: 'applications',
		component: ApplicationsIndex,
	});

	const instanceApplicationsNewRoute = createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: 'applications/new',
		component: NewApplications,
	});

	const instanceApplicationsEditorRoute = createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: 'applications/editor',
		component: EditApplications,
	});

	return [
		instanceApplicationsIndexRoute,
		instanceApplicationsNewRoute,
		instanceApplicationsEditorRoute,
	];
}
