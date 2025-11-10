import { OverallAppSignIn } from '@/features/auth/store/authStore';
import { Dashboard } from '@/features/layouts/Dashboard';
import { buildRedirectInSearch } from '@/lib/urls/buildRedirectInSearch';
import { rootRoute } from '@/router/rootRoute';
import { createRoute, redirect } from '@tanstack/react-router';

export const dashboardLayout = createRoute({
	getParentRoute: () => rootRoute,
	id: '_dashboardLayout',
	component: Dashboard,
	beforeLoad: ({ context }) => {
		const auth = context.authentication[OverallAppSignIn];
		if (auth && !auth.isLoading && !auth.user) {
			throw redirect({
				to: '/sign-in',
				search: buildRedirectInSearch(),
			});
		}
	},
});
