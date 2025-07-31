import { createRoute } from '@tanstack/react-router';
import { clustersLayoutRoute } from '@/features/clusters/routes';
import { ClusterLayout } from '@/features/cluster/ClusterLayout';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { ClusterIndex } from '@/features/cluster/index';
import { ClusterInstanceSignIn } from '@/features/cluster/ClusterInstanceSignIn';
import { ClusterSetPassword } from '@/features/cluster/ClusterSetPassword';

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
	// TODO: We're going to want to resolve auth by instanceId and clusterId too for faster checks...
	// loader: ({ context, params }) => {
	// 	return context.ClusterAuthContext.checkAuth(params.clusterId);
	// },
});

const clusterSignInRoute = createRoute({
	getParentRoute: () => clusterLayoutRoute,
	path: 'sign-in',
	component: ClusterInstanceSignIn,
	// beforeLoad: ({ context, location }) => {
	// TODO: Check if signed into this cluster.
	// if (context.authentication.user) {
	// 	const search: Record<string, string> = location?.search;
	// 	throw redirect({ to: search?.redirect?.startsWith('/') ? search.redirect : '/browse' });
	// }
	// },
});

const instanceSignInRoute = createRoute({
	getParentRoute: () => clusterLayoutRoute,
	path: 'instance/$instanceId/sign-in',
	component: ClusterInstanceSignIn,
	// beforeLoad: ({ context, location }) => {
	// TODO: Check if signed into this cluster.
	// if (context.authentication.user) {
	// 	const search: Record<string, string> = location?.search;
	// 	throw redirect({ to: search?.redirect?.startsWith('/') ? search.redirect : '/browse' });
	// }
	// },
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
