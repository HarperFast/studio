import { createInstanceLayoutRoute } from '@/features/instance/instanceLayoutRoute';
import { createRoute } from '@tanstack/react-router';
import { Databases } from './index';

export function createBrowseRouteTree(instanceLayoutRoute: ReturnType<typeof createInstanceLayoutRoute>) {
	return createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: '/databases/{-$databaseName}/{-$tableName}',
		component: Databases,
	});
}
