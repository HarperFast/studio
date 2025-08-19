import { clusterLayoutRoute } from '@/features/cluster/routes';
import { InstanceLayout } from '@/features/instance/InstanceLayout';
import { getInstanceInfoQueryOptions } from '@/features/instance/operations/queries/getInstanceInfoQuery';
import { dashboardLayout } from '@/router/dashboardRoute';
import { createRoute, redirect } from '@tanstack/react-router';

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
				const auth = context.authentication[params.clusterId];
				if (!auth || (!auth.isLoading && !auth.user)) {
					const to = `/orgs/${params.organizationId}/clusters/${params.clusterId}/sign-in`;
					throw redirect({ to, search: { redirect: location.pathname } });
				}
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
			const auth = context.authentication[params.instanceId];
			if (!auth || (!auth.isLoading && !auth.user)) {
				const to = `/orgs/${params.organizationId}/clusters/${params.clusterId}/instance/${params.instanceId}/sign-in`;
				throw redirect({ to, search: { redirect: location.pathname } });
			}
			// "beforeLoad" must resolve before "loader"s are invoked in parallel, which is perfect, because we need
			// it to set our instanceClient baseURL!
			return await context.queryClient.ensureQueryData(getInstanceInfoQueryOptions(params.clusterId, params.instanceId));
		},
	});
}
