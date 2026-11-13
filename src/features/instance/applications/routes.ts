import { ApplicationsEditor, ApplicationsIndex } from '@/features/instance/applications/ApplicationsIndex';
import { createInstanceLayoutRoute } from '@/features/instance/instanceLayoutRoute';
import { createRoute } from '@tanstack/react-router';

export function createApplicationsRoutes(
	instanceLayoutRoute: ReturnType<typeof createInstanceLayoutRoute>,
	mode: 'local' | 'cluster' | 'instance',
) {
	const instanceApplicationsIndexRoute = createRoute({
		getParentRoute: () => instanceLayoutRoute,
		// In cluster mode the bare cluster index is the cluster home (see ClusterHome); Applications
		// moves to /apps. Local and instance modes keep Applications as their index.
		path: mode === 'cluster' ? 'apps' : '/',
		head: () => ({ meta: [{ title: 'Applications — Harper Fabric' }] }),
		// Local and instance modes open on this index, so it defers to the landing page when the cluster
		// hides Applications; a cluster's /apps is only ever reached on purpose.
		component: mode === 'cluster' ? ApplicationsEditor : ApplicationsIndex,
	});

	return [
		instanceApplicationsIndexRoute,
	];
}
