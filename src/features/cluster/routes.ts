import { defaultInstanceRouteUpOne } from '@/config/constants';
import { ClusterInstanceSignIn } from '@/features/auth/ClusterInstanceSignIn';
import { authStore } from '@/features/auth/store/authStore';
import { createRoute, redirect } from '@tanstack/react-router';
import { clusterLayoutRoute } from './clusterLayoutRoute';
import { DomainsPage } from './domains/Page';
import { FinishSetup } from './FinishSetup';
import { Instances } from './Instances';
import { Scaling } from './Scaling';
import { StartingUp } from './StartingUp';

const clusterInstancesRoute = createRoute({
	getParentRoute: () => clusterLayoutRoute,
	path: 'instances',
	head: () => ({ meta: [{ title: 'Instances — Harper Fabric' }] }),
	component: Instances,
});

const clusterStartingUpRoute = createRoute({
	getParentRoute: () => clusterLayoutRoute,
	path: 'starting-up',
	head: () => ({ meta: [{ title: 'Starting Up — Harper Fabric' }] }),
	component: StartingUp,
});

const clusterScalingRoute = createRoute({
	getParentRoute: () => clusterLayoutRoute,
	path: 'scaling',
	head: () => ({ meta: [{ title: 'Scaling — Harper Fabric' }] }),
	component: Scaling,
});

const clusterDomainsRoute = createRoute({
	getParentRoute: () => clusterLayoutRoute,
	path: 'domains',
	head: () => ({ meta: [{ title: 'Domains — Harper Fabric' }] }),
	component: DomainsPage,
});

// These guards intentionally read live `authStore` state rather than the `context.authentication`
// snapshot. Clicking "Direct Sign In" clears the connection synchronously, but the router context
// lags (authStore notifies its listeners asynchronously), so the snapshot still shows the old user
// — which would bounce us off the sign-in form and back into Fabric Connect (HarperFast/studio#1333).

export function redirectAwayFromSignInIfConnected(
	{ location, params }: {
		location?: { search?: { redirect?: string } };
		params: { clusterId: string };
	},
) {
	const isFabricConnect = authStore.checkForFabricConnect(params.clusterId);
	if (authStore.getConnectionById(params.clusterId).user && !isFabricConnect) {
		const redirectTo = location?.search?.redirect;
		throw redirect({
			to: redirectTo?.startsWith('/') ? redirectTo : defaultInstanceRouteUpOne,
		});
	}
}

export function redirectAwayFromInstanceSignInIfConnected(
	{ location, params }: {
		location?: { search?: { redirect?: string } };
		params: { clusterId: string; instanceId: string };
	},
) {
	const isFabricConnect = authStore.checkForFabricConnect(params.clusterId)
		|| authStore.checkForFabricConnect(params.instanceId);
	if (isFabricConnect) {
		return;
	}
	if (authStore.getConnectionById(params.instanceId).user) {
		const redirectTo = location?.search?.redirect;
		throw redirect({
			to: redirectTo?.startsWith('/') ? redirectTo : defaultInstanceRouteUpOne,
		});
	}
}

const clusterSignInRoute = createRoute({
	getParentRoute: () => clusterLayoutRoute,
	path: 'sign-in',
	head: () => ({ meta: [{ title: 'Sign In — Harper Fabric' }] }),
	component: ClusterInstanceSignIn,
	beforeLoad: redirectAwayFromSignInIfConnected,
});

const instanceSignInRoute = createRoute({
	getParentRoute: () => clusterLayoutRoute,
	path: 'instance/$instanceId/sign-in',
	head: () => ({ meta: [{ title: 'Sign In — Harper Fabric' }] }),
	component: ClusterInstanceSignIn,
	beforeLoad: redirectAwayFromInstanceSignInIfConnected,
});

const clusterFinishSetupRoute = createRoute({
	getParentRoute: () => clusterLayoutRoute,
	path: 'finish-setup',
	head: () => ({ meta: [{ title: 'Create Admin User — Harper Fabric' }] }),
	component: FinishSetup,
});

export const clusterRoutes = [
	clusterInstancesRoute,
	clusterStartingUpRoute,
	clusterScalingRoute,
	clusterDomainsRoute,
	clusterFinishSetupRoute,
	clusterSignInRoute,
	instanceSignInRoute,
];
