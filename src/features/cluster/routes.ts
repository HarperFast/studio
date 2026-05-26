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

const clusterSignInRoute = createRoute({
	getParentRoute: () => clusterLayoutRoute,
	path: 'sign-in',
	head: () => ({ meta: [{ title: 'Sign In — Harper Fabric' }] }),
	component: ClusterInstanceSignIn,
	beforeLoad: ({ context, location, params }) => {
		const isFabricConnect = authStore.checkForFabricConnect(params.clusterId);
		if (context.authentication[params.clusterId]?.user && !isFabricConnect) {
			const search: Record<string, string> = location?.search;
			throw redirect({
				to: search?.redirect?.startsWith('/')
					? search.redirect
					: defaultInstanceRouteUpOne,
			});
		}
	},
});

const instanceSignInRoute = createRoute({
	getParentRoute: () => clusterLayoutRoute,
	path: 'instance/$instanceId/sign-in',
	head: () => ({ meta: [{ title: 'Sign In — Harper Fabric' }] }),
	component: ClusterInstanceSignIn,
	beforeLoad: ({ context, location, params }) => {
		const isFabricConnect = authStore.checkForFabricConnect(params.clusterId)
			|| authStore.checkForFabricConnect(params.instanceId);
		if (isFabricConnect) {
			return;
		}
		if (context.authentication[params.instanceId]?.user) {
			const search: Record<string, string> = location?.search;
			throw redirect({
				to: search?.redirect?.startsWith('/')
					? search.redirect
					: defaultInstanceRouteUpOne,
			});
		}
	},
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
