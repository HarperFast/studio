import { defaultInstanceRouteUpOne } from '@/config/constants';
import { ClusterInstanceSignIn } from '@/features/auth/ClusterInstanceSignIn';
import { authStore } from '@/features/auth/store/authStore';
import { createRoute, redirect } from '@tanstack/react-router';
import { clusterLayoutRoute } from './clusterLayoutRoute';
import { FinishSetup } from './FinishSetup';
import { Instances } from './Instances';
import { Scaling } from './Scaling';
import { StartingUp } from './StartingUp';

const clusterInstancesRoute = createRoute({
	getParentRoute: () => clusterLayoutRoute,
	path: 'instances',
	component: Instances,
});

const clusterStartingUpRoute = createRoute({
	getParentRoute: () => clusterLayoutRoute,
	path: 'starting-up',
	component: StartingUp,
});

const clusterScalingRoute = createRoute({
	getParentRoute: () => clusterLayoutRoute,
	path: 'scaling',
	component: Scaling,
});

const clusterSignInRoute = createRoute({
	getParentRoute: () => clusterLayoutRoute,
	path: 'sign-in',
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
	component: FinishSetup,
});

export const clusterRoutes = [
	clusterInstancesRoute,
	clusterStartingUpRoute,
	clusterScalingRoute,
	clusterFinishSetupRoute,
	clusterSignInRoute,
	instanceSignInRoute,
];
