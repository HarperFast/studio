import { defaultInstanceRouteUpOne } from '@/config/constants';
import { ClusterInstanceSignIn } from '@/features/auth/ClusterInstanceSignIn';
import { clusterLayoutRoute } from '@/features/cluster/clusterLayoutRoute';
import { FinishSetup } from '@/features/cluster/FinishSetup';
import { Instances } from '@/features/cluster/Instances';
import { Progress } from '@/features/cluster/Progress';
import { createRoute, redirect } from '@tanstack/react-router';

const clusterInstancesRoute = createRoute({
	getParentRoute: () => clusterLayoutRoute,
	path: 'instances',
	component: Instances,
});

const clusterProgressRoute = createRoute({
	getParentRoute: () => clusterLayoutRoute,
	path: 'progress',
	component: Progress,
});

const clusterSignInRoute = createRoute({
	getParentRoute: () => clusterLayoutRoute,
	path: 'sign-in',
	component: ClusterInstanceSignIn,
	beforeLoad: ({ context, location, params }) => {
		if (context.authentication[params.clusterId]?.user) {
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
		if (context.authentication[params.instanceId || params.clusterId]?.user) {
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
	clusterProgressRoute,
	clusterFinishSetupRoute,
	clusterSignInRoute,
	instanceSignInRoute,
];
