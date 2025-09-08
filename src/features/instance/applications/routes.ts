import { createInstanceLayoutRoute } from '@/features/instance/instanceLayoutRoute';
import { createRoute } from '@tanstack/react-router';
import { ApplicationsEditor } from '@/features/instance/applications';

export function createApplicationsRoutes(instanceLayoutRoute: ReturnType<typeof createInstanceLayoutRoute>) {
	const instanceApplicationsIndexRoute = createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: '/',
		component: ApplicationsEditor,
	});

	return [
		instanceApplicationsIndexRoute,
	];
}
