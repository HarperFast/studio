import { createRootRoute, createRoute } from '@tanstack/react-router';
import { StudioLocal } from '../StudioLocal';
import { LocalSignIn } from '../features/auth/LocalSignIn';
import { Dashboard } from '../features/layouts/Dashboard';
import { Browse } from '@/features/instance/browse';
import { ApplicationsIndex as Applications } from '@/features/instance/applications';
import { Logs as Log } from '@/features/instance/log';
import { Status } from '@/features/instance/status';
import { InstanceLayout } from '@/features/instance/InstanceLayout';

const rootRoute = createRootRoute({
	component: StudioLocal,
});

// Auth Route
const localSignInRoute = createRoute({
	getParentRoute: () => rootRoute,
	path: '/',
	component: LocalSignIn,
});

// Dashboard Routes
const dashboardLayout = createRoute({
	getParentRoute: () => rootRoute,
	id: '_dashboardLayout',
	component: Dashboard,
});

const localInstanceRoute = createRoute({
	getParentRoute: () => dashboardLayout,
	path: 'instance',
	component: InstanceLayout,
});

const browseInstanceRoute = createRoute({
	getParentRoute: () => localInstanceRoute,
	path: 'browse',
	component: Browse,
});

const applicationsInstanceRoute = createRoute({
	getParentRoute: () => localInstanceRoute,
	path: 'applications',
	component: Applications,
});

const statusInstanceRoute = createRoute({
	getParentRoute: () => localInstanceRoute,
	path: 'status',
	component: Status,
});

const logsInstanceRoute = createRoute({
	getParentRoute: () => localInstanceRoute,
	path: 'logs',
	component: Log,
});

export const localRouteTree = rootRoute.addChildren([
	localSignInRoute,
	dashboardLayout.addChildren([
		localInstanceRoute.addChildren([
			browseInstanceRoute,
			applicationsInstanceRoute,
			statusInstanceRoute,
			logsInstanceRoute,
		]),
	]),
]);
