import { getInstanceClient } from '@/config/getInstanceClient';
import {
	AuthenticatedCloudConnection,
	AuthenticatedConnection,
	authStore,
	OverallAppSignIn,
} from '@/features/auth/store/authStore';
import { clusterLayoutRoute } from '@/features/cluster/clusterLayoutRoute';
import { InstanceLayout } from '@/features/instance/InstanceLayout';
import { getOrganizationClusterInstancePermissions, getOrganizationClusterPermissions } from '@/hooks/usePermissions';
import { getInstanceUserInfo } from '@/integrations/api/instance/status/getInstanceUserInfo';
import { buildRedirectInSearch } from '@/lib/urls/buildRedirectInSearch';
import { dashboardLayout } from '@/router/dashboardRoute';
import { createRoute, redirect } from '@tanstack/react-router';
import { registrationInfoLoader } from './registrationInfoLoader';

export function createInstanceLayoutRoute(mode: 'local' | 'cluster' | 'instance') {
	switch (mode) {
		case 'local':
			return createRoute({
				getParentRoute: () => dashboardLayout,
				id: '_instanceLayout',
				component: InstanceLayout,
				loader: registrationInfoLoader,
			});
		case 'cluster':
			return createRoute({
				getParentRoute: () => clusterLayoutRoute,
				id: '_instanceLayout',
				component: InstanceLayout,
				beforeLoad: checkClusterInstanceAuthenticationBeforeLoad,
				loader: registrationInfoLoader,
			});
		case 'instance':
			return createRoute({
				getParentRoute: () => clusterLayoutRoute,
				path: 'instance/$instanceId',
				component: InstanceLayout,
				beforeLoad: checkClusterInstanceAuthenticationBeforeLoad,
				loader: registrationInfoLoader,
			});
	}
}

async function checkClusterInstanceAuthenticationBeforeLoad({
	context,
	params,
}: {
	context: { authentication: Record<string, AuthenticatedConnection> },
	params: { organizationId: string; clusterId: string, instanceId?: string }
}) {
	// Are we already authenticated?
	const auth = context.authentication[params.instanceId || params.clusterId];
	if (auth?.isLoading || auth?.user) {
		return;
	}

	// See if we can Fabric Connect.
	const overallAuth = context.authentication[OverallAppSignIn] as AuthenticatedCloudConnection;
	if (overallAuth?.isLoading) {
		return;
	}
	const { update } = params.instanceId
		? getOrganizationClusterInstancePermissions(overallAuth.user, params.organizationId, params.clusterId)
		: getOrganizationClusterPermissions(overallAuth.user, params.organizationId, params.clusterId);
	if (update) {
		const entityId = params.instanceId || params.clusterId;
		const instanceClient = getInstanceClient({
			id: entityId,
			forceFabricConnect: true,
		});
		try {
			const user = await getInstanceUserInfo({ instanceClient });
			authStore.setUserForIdAndKey(
				entityId,
				instanceClient.defaults.baseURL!,
				user,
			);
			authStore.flagForFabricConnect(entityId, true);
			return;
		} catch (err) {
			console.error('Fabric Connect not established', err);
		}
	}

	const to = `/${params.organizationId}/${params.clusterId}/`
		+ (params.instanceId ? `instance/${params.instanceId}` : '')
		+ `/sign-in`;
	throw redirect({ to, search: buildRedirectInSearch() });
}
