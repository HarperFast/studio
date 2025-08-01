import { ClusterInstanceSignIn } from '@/features/cluster/ClusterInstanceSignIn';
import { ClusterLayout } from '@/features/cluster/ClusterLayout';
import { ClusterSetPassword } from '@/features/cluster/ClusterSetPassword';
import { ClusterIndex } from '@/features/cluster/index';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { clustersLayoutRoute } from '@/features/clusters/routes';
import { createRoute, redirect } from '@tanstack/react-router';

export const clusterLayoutRoute = createRoute({
	getParentRoute: () => clustersLayoutRoute,
	path: '$clusterId',
	component: ClusterLayout,
	loader: ({ context, params }) => {
		return context.queryClient.ensureQueryData(getClusterInfoQueryOptions(params.clusterId));
	},
});

const clusterIndexRoute = createRoute({
	getParentRoute: () => clusterLayoutRoute,
	path: '/',
	component: ClusterIndex,
});

const clusterSignInRoute = createRoute({
	getParentRoute: () => clusterLayoutRoute,
	path: 'sign-in',
	component: ClusterInstanceSignIn,
	beforeLoad: ({ context, location, params }) => {
		if (context.authentication[params.clusterId]?.user) {
			const search: Record<string, string> = location?.search;
			throw redirect({ to: search?.redirect?.startsWith('/')
					? search.redirect
					: '../browse' });
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
			throw redirect({ to: search?.redirect?.startsWith('/')
					? search.redirect
					: '../browse' });
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
