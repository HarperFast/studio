import { AdminShell } from '@/features/admin/components/AdminShell';
import { dashboardLayout } from '@/router/dashboardRoute';
import { createRoute, lazyRouteComponent, redirect } from '@tanstack/react-router';

export const adminLayoutRoute = createRoute({
	getParentRoute: () => dashboardLayout,
	path: 'admin',
	component: AdminShell,
});

// /admin itself has no page of its own — send it to whatever sits at the top of AdminShell's rail.
// A redirect rather than a second component mount, so each section keeps exactly one URL (links
// shared before Regions existed still point at /admin/notifications). Keep in step when reordering.
// Accounts that can't see the target page are bounced onward by AdminShell's permission filter.
const adminIndexRoute = createRoute({
	getParentRoute: () => adminLayoutRoute,
	path: '/',
	beforeLoad: () => {
		throw redirect({ to: '/admin/notifications' });
	},
});

const notificationsAdminRoute = createRoute({
	getParentRoute: () => adminLayoutRoute,
	path: 'notifications',
	head: () => ({ meta: [{ title: 'Notifications — Harper Fabric' }] }),
	component: lazyRouteComponent(async () => import('@/features/admin/notifications/index'), 'NotificationsAdminIndex'),
});

const regionsRoute = createRoute({
	getParentRoute: () => adminLayoutRoute,
	path: 'regions',
	head: () => ({ meta: [{ title: 'Regions — Harper Fabric' }] }),
	component: lazyRouteComponent(async () => import('@/features/admin/regions/index'), 'RegionsIndex'),
});

const billingRoute = createRoute({
	getParentRoute: () => adminLayoutRoute,
	path: 'billing',
	head: () => ({ meta: [{ title: 'Billing — Harper Fabric' }] }),
	component: lazyRouteComponent(async () => import('@/features/admin/billing/index'), 'BillingAdminIndex'),
});

const plansRoute = createRoute({
	getParentRoute: () => adminLayoutRoute,
	path: 'plans',
	head: () => ({ meta: [{ title: 'Plans — Harper Fabric' }] }),
	component: lazyRouteComponent(async () => import('@/features/admin/plans/index'), 'PlansAdminIndex'),
});

const grantsRoute = createRoute({
	getParentRoute: () => adminLayoutRoute,
	path: 'grants',
	head: () => ({ meta: [{ title: 'Grants — Harper Fabric' }] }),
	component: lazyRouteComponent(async () => import('@/features/admin/grants/index'), 'GrantsAdminIndex'),
});

const usersRoute = createRoute({
	getParentRoute: () => adminLayoutRoute,
	path: 'users',
	head: () => ({ meta: [{ title: 'Users — Harper Fabric' }] }),
	component: lazyRouteComponent(async () => import('@/features/admin/users/index'), 'UsersAdminLayout'),
});

const usersIndexRoute = createRoute({
	getParentRoute: () => usersRoute,
	path: '/',
	component: lazyRouteComponent(async () => import('@/features/admin/users/index'), 'UsersSearchPrompt'),
});

// Keyed by id, never by email: page URLs reach RUM and third-party pixels.
const userDetailsRoute = createRoute({
	getParentRoute: () => usersRoute,
	path: '$userId',
	head: () => ({ meta: [{ title: 'User — Harper Fabric' }] }),
	component: lazyRouteComponent(async () => import('@/features/admin/users/UserDetails'), 'UserDetailsPage'),
});

const configurationRoute = createRoute({
	getParentRoute: () => adminLayoutRoute,
	path: 'configuration',
	head: () => ({ meta: [{ title: 'Configuration — Harper Fabric' }] }),
	component: lazyRouteComponent(async () => import('@/features/admin/configuration/index'), 'ConfigurationIndex'),
});

const apiTokenRoute = createRoute({
	getParentRoute: () => adminLayoutRoute,
	path: 'api-token',
	head: () => ({ meta: [{ title: 'API Tokens — Harper Fabric' }] }),
	component: lazyRouteComponent(async () => import('@/features/admin/apiToken/index'), 'ApiTokenIndex'),
});

const workflowsRoute = createRoute({
	getParentRoute: () => adminLayoutRoute,
	path: 'workflows',
	head: () => ({ meta: [{ title: 'Workflows — Harper Fabric' }] }),
	component: lazyRouteComponent(async () => import('@/features/admin/workflows/index'), 'WorkflowsAdminIndex'),
});

// A child workflow's id contains slashes; the router encodes them into this one segment and decodes them back.
const workflowDetailRoute = createRoute({
	getParentRoute: () => adminLayoutRoute,
	path: 'workflows/$workflowId',
	head: () => ({ meta: [{ title: 'Workflow — Harper Fabric' }] }),
	component: lazyRouteComponent(async () => import('@/features/admin/workflows/WorkflowDetail'), 'WorkflowDetailPage'),
});

// Parent: adminLayoutRoute (keep in lockstep with rootRouteTree's addChildren).
export const adminRoutes = [
	adminIndexRoute,
	notificationsAdminRoute,
	regionsRoute,
	plansRoute,
	grantsRoute,
	billingRoute,
	apiTokenRoute,
];
