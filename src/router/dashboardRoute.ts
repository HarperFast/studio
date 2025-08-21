import { OverallAppSignIn } from '@/lib/authStore';
import { currentUrlAfterHash } from '@/lib/urls/currentUrlAfterHash';
import { createRoute, redirect } from '@tanstack/react-router';
import { rootRoute } from '@/router/rootRoute';
import { Dashboard } from '@/features/layouts/Dashboard';

export const dashboardLayout = createRoute({
	getParentRoute: () => rootRoute,
	id: '_dashboardLayout',
	component: Dashboard,
	beforeLoad: ({ context }) => {
		const auth = context.authentication[OverallAppSignIn];
		if (auth && !auth.isLoading && !auth.user) {
			throw redirect({
				to: '/',
				search: {
					redirect: currentUrlAfterHash(),
				},
			});
		}
	},
});
