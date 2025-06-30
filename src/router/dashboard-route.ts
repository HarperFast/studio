import { createRoute, redirect } from '@tanstack/react-router';
import { rootRoute } from '@/router/root-route';
import { Dashboard } from '@/features/layouts/Dashboard';

export const dashboardLayout = createRoute({
	getParentRoute: () => rootRoute,
	id: '_dashboardLayout',
	component: Dashboard,
	beforeLoad: ({ context, location }) => {
		// TODO: Sometimes when I refresh the page, we're getting isLoading: false, user: null for one frame. We double
		//  redirect the user back to where they were, but it's not ideal.
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
