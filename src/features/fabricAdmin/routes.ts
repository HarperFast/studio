import { FabricAdminShell } from '@/features/fabricAdmin/components/FabricAdminShell';
import { dashboardLayout } from '@/router/dashboardRoute';
import { createRoute, lazyRouteComponent } from '@tanstack/react-router';

export const fabricAdminLayoutRoute = createRoute({
	getParentRoute: () => dashboardLayout,
	path: 'fabric-admin',
	component: FabricAdminShell,
});

const apiTokenRoute = createRoute({
	getParentRoute: () => fabricAdminLayoutRoute,
	path: '/',
	head: () => ({ meta: [{ title: 'API Token — Harper Fabric' }] }),
	component: lazyRouteComponent(async () => import('@/features/fabricAdmin/apiToken/index'), 'ApiTokenIndex'),
});

// Parent: fabricAdminLayoutRoute (keep in lockstep with rootRouteTree's addChildren).
export const fabricAdminRoutes = [apiTokenRoute];
