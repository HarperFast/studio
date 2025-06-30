import { createRoute, redirect } from '@tanstack/react-router';
import { rootRoute } from '@/router/root-route';
import { Dashboard } from '@/features/layouts/Dashboard';

export const dashboardLayout = createRoute({
	getParentRoute: () => rootRoute,
	id: '_dashboardLayout',
	component: Dashboard,
	beforeLoad: ({ context, location }) => {
		if (!context.authentication.isLoading && !context.authentication.user) {
			throw redirect({
				to: '/',
				search: {
					redirect: location.href,
				},
			});
		}
	},
});
