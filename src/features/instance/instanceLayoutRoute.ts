import { getInstanceClientIdFromParams } from '@/config/useInstanceClient';
import { clusterLayoutRoute } from '@/features/cluster/clusterLayoutRoute';
import { InstanceLayout } from '@/features/instance/InstanceLayout';
import { getRegistrationInfoQueryOptions } from '@/features/instance/operations/queries/getRegistrationInfo';
import { buildRedirectInSearch } from '@/lib/urls/buildRedirectInSearch';
import { dashboardLayout } from '@/router/dashboardRoute';
import { createRoute, redirect } from '@tanstack/react-router';

export function createInstanceLayoutRoute(mode: 'local' | 'cluster' | 'instance') {
	if (mode === 'local') {
		return createRoute({
			getParentRoute: () => dashboardLayout,
			id: '_instanceLayout',
			component: InstanceLayout,
			loader: async ({ context, params }) => {
				const operationsParams = getInstanceClientIdFromParams(params);
				return context.queryClient.ensureQueryData(getRegistrationInfoQueryOptions(operationsParams));
			},
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
			},
			loader: async ({ context, params }) => {
				const operationsParams = getInstanceClientIdFromParams(params);
				return context.queryClient.ensureQueryData(getRegistrationInfoQueryOptions(operationsParams));
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
		},
		loader: async ({ context, params }) => {
			const operationsParams = getInstanceClientIdFromParams(params);
			return context.queryClient.ensureQueryData(getRegistrationInfoQueryOptions(operationsParams));
		},
	});
}
