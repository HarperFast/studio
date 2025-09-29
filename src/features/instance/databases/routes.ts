import { createRoute } from '@tanstack/react-router';
import { DatabasesLayout } from '@/features/instance/databases/index';
import { DatabaseTableView } from '@/features/instance/databases/DatabaseTableView';
import { createInstanceLayoutRoute } from '@/features/instance/instanceLayoutRoute';
import { loadInstanceBrowseData } from '@/features/instance/databases/route.load';

export function createBrowseRouteTree(instanceLayoutRoute: ReturnType<typeof createInstanceLayoutRoute>) {
	const instanceBrowseRoute = createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: '/databases',
		loader: ({ context, params, preload }) => loadInstanceBrowseData(context.queryClient, params, preload),
		component: DatabasesLayout,
	});
	const browseDatabaseRoute = createRoute({
		getParentRoute: () => instanceBrowseRoute,
		path: '$databaseName',
		loader: ({ context, params, preload }) => loadInstanceBrowseData(context.queryClient, params, preload),
	});
	const browseTableRoute = createRoute({
		getParentRoute: () => instanceBrowseRoute,
		path: '$databaseName/$tableName',
		loader: ({ context, params, preload }) => loadInstanceBrowseData(context.queryClient, params, preload),
		component: DatabaseTableView,
	});

	return instanceBrowseRoute.addChildren([
		browseDatabaseRoute,
		browseTableRoute,
	]);
}
