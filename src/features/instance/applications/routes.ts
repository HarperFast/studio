import { ApplicationsEditor } from '@/features/instance/applications';
import { createInstanceLayoutRoute } from '@/features/instance/instanceLayoutRoute';
import { createRoute } from '@tanstack/react-router';

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
