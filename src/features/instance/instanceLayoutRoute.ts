import { createRoute } from '@tanstack/react-router';
import { dashboardLayout } from '@/router/dashboardRoute';
import { InstanceLayout } from '@/features/instance/InstanceLayout';
import { clusterLayoutRoute } from '@/features/cluster/routes';
import { getInstanceInfoQueryOptions } from '@/features/instance/operations/queries/getInstanceInfoQuery';

export function createInstanceLayoutRoute(mode: 'local' | 'cluster' | 'instance') {
	if (mode === 'local') {
		return createRoute({
			getParentRoute: () => dashboardLayout,
			id: '_instanceLayout',
			component: InstanceLayout,
		});
	}
	if (mode === 'cluster') {
		return createRoute({
			getParentRoute: () => clusterLayoutRoute,
			id: '_instanceLayout',
			component: InstanceLayout,
			beforeLoad: async ({ context, params }) => {
				// "beforeLoad" must resolve before "loader"s are invoked in parallel, which is perfect, because we need
				// it to set our instanceClient baseURL!
				return await context.queryClient.ensureQueryData(getInstanceInfoQueryOptions(params.clusterId));
			},
		});
	}
	return createRoute({
		getParentRoute: () => clusterLayoutRoute,
		path: 'instance/$instanceId',
		component: InstanceLayout,
		beforeLoad: async ({ context, params }) => {
			// "beforeLoad" must resolve before "loader"s are invoked in parallel, which is perfect, because we need
			// it to set our instanceClient baseURL!
			return await context.queryClient.ensureQueryData(getInstanceInfoQueryOptions(params.clusterId, params.instanceId));
		},
	});
}
