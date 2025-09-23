import { clusterLayoutRoute } from '@/features/cluster/clusterLayoutRoute';
import { getInstanceInfoQueryOptions } from '@/features/cluster/queries/getInstanceInfoQuery';
import { InstanceLayout } from '@/features/instance/InstanceLayout';
import { buildRedirectInSearch } from '@/lib/urls/buildRedirectInSearch';
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
					const to = `/${params.organizationId}/${params.clusterId}/sign-in`;
					throw redirect({ to, search: buildRedirectInSearch() });
				}
				return await context.queryClient.ensureQueryData(getInstanceInfoQueryOptions(params));
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
				const to = `/${params.organizationId}/${params.clusterId}/instance/${params.instanceId}/sign-in`;
				throw redirect({ to, search: buildRedirectInSearch() });
			}
			return await context.queryClient.ensureQueryData(getInstanceInfoQueryOptions(params));
		},
	});
}
