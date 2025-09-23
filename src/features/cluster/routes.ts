import { defaultInstanceRouteUpOne } from '@/config/constants';
import { ClusterInstanceSignIn } from '@/features/auth/ClusterInstanceSignIn';
import { clusterLayoutRoute } from '@/features/cluster/clusterLayoutRoute';
import { ClusterSetPassword } from '@/features/cluster/ClusterSetPassword';
import { ClusterIndex } from '@/features/cluster/index';
import { createRoute, redirect } from '@tanstack/react-router';

const clusterIndexRoute = createRoute({
	getParentRoute: () => clusterLayoutRoute,
	path: 'instances',
	component: ClusterIndex,
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

const clusterSetPasswordRoute = createRoute({
	getParentRoute: () => clusterLayoutRoute,
	path: 'set-password',
	component: ClusterSetPassword,
});

export const clusterRoutes = [
	clusterIndexRoute,
	clusterSignInRoute,
	instanceSignInRoute,
	clusterSetPasswordRoute,
];
