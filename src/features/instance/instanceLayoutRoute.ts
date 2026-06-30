import {
	AuthenticatedCloudConnection,
	AuthenticatedConnection,
	authStore,
	OverallAppSignIn,
} from '@/features/auth/store/authStore';
import { clusterLayoutRoute } from '@/features/cluster/clusterLayoutRoute';
import { InstanceLayout } from '@/features/instance/InstanceLayout';
import { getOrganizationClusterInstancePermissions, getOrganizationClusterPermissions } from '@/hooks/usePermissions';
import { Cluster } from '@/integrations/api/api.patch';
import { buildRedirectInSearch } from '@/lib/urls/buildRedirectInSearch';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';
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

export async function checkClusterInstanceAuthenticationBeforeLoad({
	context,
	params,
}: {
	context: { authentication: Record<string, AuthenticatedConnection>; cluster?: Cluster };
	params: { organizationId: string; clusterId: string; instanceId?: string };
}) {
	const entityId = params.instanceId || params.clusterId;

	// The Fabric Connect JWT lives only in memory, so after a reload we still have the persisted flag
	// but no token. Re-establish direct connect before anything tries to talk to the instance.
	let attemptedEstablish = false;
	if (authStore.checkForFabricConnect(entityId) && !authStore.hasResolvedFabricConnect(entityId)) {
		attemptedEstablish = true;
		if (await tryEstablishFabricConnect(entityId, context.cluster, params.instanceId)) {
			return;
		}
	}

	// Are we already authenticated (direct sign-in, basic auth, or a resolved Fabric Connect)?
	const auth = context.authentication[entityId];
	if (auth?.isLoading || auth?.user) {
		return;
	}

	// Wait for the app-level sign-in to resolve before deciding whether to redirect.
	const overallAuth = context.authentication[OverallAppSignIn] as AuthenticatedCloudConnection;
	if (overallAuth?.isLoading) {
		return;
	}

	// First visit: if the user can manage this entity, connect them via Fabric Connect automatically.
	// Skip if we already tried above (e.g. reload with an unreachable proxy) to avoid a duplicate mint.
	const { update } = params.instanceId
		? getOrganizationClusterInstancePermissions(overallAuth.user, params.organizationId, params.clusterId)
		: getOrganizationClusterPermissions(overallAuth.user, params.organizationId, params.clusterId);
	if (!attemptedEstablish && update && await tryEstablishFabricConnect(entityId, context.cluster, params.instanceId)) {
		return;
	}

	const to = `/${params.organizationId}/${params.clusterId}/`
		+ (params.instanceId ? `instance/${params.instanceId}` : '')
		+ `/sign-in`;
	throw redirect({ to, search: buildRedirectInSearch() });
}

/** Establishes Fabric Connect auth, returning whether it succeeded. */
async function tryEstablishFabricConnect(
	entityId: string,
	cluster: Cluster | undefined,
	instanceId: string | undefined,
): Promise<boolean> {
	try {
		await authStore.establishFabricConnectAuth({
			id: entityId,
			operationsUrl: resolveDirectOperationsUrl(cluster, instanceId),
		});
		return true;
	} catch (err) {
		// Expected: the instance may be down, restarting, or unauthorized. The caller falls through to
		// the sign-in redirect. Use debug so RUM doesn't forward it to Datadog (it only forwards errors).
		console.debug('Fabric Connect not established', err);
		return false;
	}
}

/**
 * Resolves the instance's (or cluster's) direct operations URL from the cluster loaded by the parent
 * route, so Fabric Connect can attempt a direct Bearer connection. Returns undefined when the entity
 * can't be found, in which case establishFabricConnectAuth falls back to the proxy.
 */
function resolveDirectOperationsUrl(cluster: Cluster | undefined, instanceId: string | undefined): string | undefined {
	if (instanceId) {
		const instance = cluster?.instances?.find((candidate) => candidate.id === instanceId);
		return instance ? getOperationsUrlForInstance(instance) : undefined;
	}
	return getOperationsUrlForCluster(cluster) ?? undefined;
}
