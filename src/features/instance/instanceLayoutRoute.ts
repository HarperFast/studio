import {
	AuthenticatedCloudConnection,
	AuthenticatedConnection,
	authStore,
	OverallAppSignIn,
} from '@/features/auth/store/authStore';
import { clusterLayoutRoute } from '@/features/cluster/clusterLayoutRoute';
import { redirectAwayFromDeletedCluster } from '@/features/cluster/redirectAwayFromDeletedCluster';
import { InstanceLayout } from '@/features/instance/InstanceLayout';
import { hasStaffPermission } from '@/hooks/useAuth';
import { getOrganizationClusterInstancePermissions, getOrganizationClusterPermissions } from '@/hooks/usePermissions';
import { Cluster } from '@/integrations/api/api.patch';
import { buildRedirectInSearch } from '@/lib/urls/buildRedirectInSearch';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';
import { describeError } from '@/react-query/queryClient';
import { dashboardLayout } from '@/router/dashboardRoute';
import { createRoute, redirect } from '@tanstack/react-router';
import { toast } from 'sonner';
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
	redirectAwayFromDeletedCluster({ context, params });
	// Until setup, Fabric Connect would connect as the provisioning account, which Finish Setup drops. The overview
	// routes on to setup.
	if (context.cluster?.resetPassword) {
		throw redirect({ to: `/${params.organizationId}/${params.clusterId}` });
	}

	const entityId = params.instanceId || params.clusterId;

	// The Fabric Connect JWT lives only in memory, so after a reload we still have the persisted flag
	// but no token. Re-establish direct connect before anything tries to talk to the instance.
	let attemptedEstablish = false;
	if (authStore.checkForFabricConnect(entityId) && !authStore.hasResolvedFabricConnect(entityId)) {
		attemptedEstablish = true;
		const reloadingUser = (context.authentication[OverallAppSignIn] as AuthenticatedCloudConnection | undefined)?.user;
		const readOnly = !!reloadingUser && connectionAccess(reloadingUser, params).readOnly;
		if (await tryEstablishFabricConnect(entityId, context.cluster, params.instanceId, readOnly)) {
			return;
		}
	}

	// Nothing else checks a remembered sign-in before this route's loader runs. The answer reaches the
	// root context, whose change re-runs this guard.
	authStore.startSignInCheck(entityId);

	// Are we already authenticated (direct sign-in, basic auth, or a resolved Fabric Connect)?
	// Read LIVE auth state, not the context.authentication snapshot: a direct sign-in sets the
	// connection synchronously but the router context lags (authStore notifies listeners
	// asynchronously), so the snapshot would miss the just-signed-in user and we'd wrongly
	// auto-Fabric-Connect over the direct session (the user lands back on the cluster list as
	// "Fabric Connect" instead of "Direct Connect").
	const auth = authStore.getConnectionById(entityId);
	if (auth.isLoading || auth.user) {
		return;
	}

	// Wait for the app-level sign-in to resolve before deciding whether to redirect. If there's no
	// app-level connection in the context at all, don't redirect from here — another guard owns that
	// decision, and stacking redirects within one navigation can corrupt router state. Returning also
	// avoids dereferencing `overallAuth.user` below (which threw "Cannot read properties of undefined").
	const overallAuth = context.authentication[OverallAppSignIn] as AuthenticatedCloudConnection | undefined;
	if (!overallAuth || overallAuth.isLoading) {
		return;
	}

	// First visit: if the user can manage this entity, connect them via Fabric Connect automatically.
	// Skip if we already tried above (e.g. reload with an unreachable proxy) to avoid a duplicate mint.
	const { update, readOnly } = connectionAccess(overallAuth.user, params);
	if (
		!attemptedEstablish && (update || readOnly)
		&& await tryEstablishFabricConnect(entityId, context.cluster, params.instanceId, readOnly)
	) {
		return;
	}

	const to = `/${params.organizationId}/${params.clusterId}/`
		+ (params.instanceId ? `instance/${params.instanceId}` : '')
		+ `/sign-in`;
	throw redirect({ to, search: buildRedirectInSearch() });
}

function connectionAccess(
	user: AuthenticatedCloudConnection['user'],
	params: { organizationId: string; clusterId: string; instanceId?: string },
): { update: boolean; readOnly: boolean } {
	const { update } = params.instanceId
		? getOrganizationClusterInstancePermissions(user, params.organizationId, params.clusterId)
		: getOrganizationClusterPermissions(user, params.organizationId, params.clusterId);
	return { update, readOnly: !update && hasStaffPermission(user, 'cluster:connectReadOnly') };
}

/**
 * A read-only caller has no instance credentials to fall back on, so its failure is shown rather than
 * left to the sign-in redirect.
 */
async function tryEstablishFabricConnect(
	entityId: string,
	cluster: Cluster | undefined,
	instanceId: string | undefined,
	reportFailure = false,
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
		if (reportFailure && (err as Error)?.name !== 'SignedOutWhileConnectingError') {
			const { title, description } = describeError(err);
			toast.error(`Read-only access unavailable: ${title}`, { description });
		}
		return false;
	}
}

/**
 * Resolves the instance's (or cluster's) direct operations URL from the cluster loaded by the parent
 * route, so Fabric Connect can attempt a direct Bearer connection. Returns undefined when the entity
 * can't be found, in which case establishFabricConnectAuth falls back to the proxy. Throws for an
 * instance with no address yet, so no Fabric Connect is attempted for it, matching the Instances list.
 */
function resolveDirectOperationsUrl(cluster: Cluster | undefined, instanceId: string | undefined): string | undefined {
	if (instanceId) {
		const instance = cluster?.instances?.find((candidate) => candidate.id === instanceId);
		if (!instance) {
			return undefined;
		}
		const operationsUrl = getOperationsUrlForInstance(instance);
		if (!operationsUrl) {
			throw new Error(`Instance ${instanceId} has no address yet`);
		}
		return operationsUrl;
	}
	return getOperationsUrlForCluster(cluster) ?? undefined;
}
