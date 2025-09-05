import { createRoute } from '@tanstack/react-router';
import { Databases } from '@/features/instance/databases/index';
import { BrowseDataTableView } from '@/features/instance/databases/components/BrowseDataTableView';
import { createInstanceLayoutRoute } from '@/features/instance/instanceLayoutRoute';
import { loadInstanceBrowseData } from '@/features/instance/databases/route.load';

export function createBrowseRouteTree(instanceLayoutRoute: ReturnType<typeof createInstanceLayoutRoute>) {
	const instanceBrowseRoute = createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: '/databases',
		component: Databases,
		loader: ({ context, params, preload }) => loadInstanceBrowseData(context.queryClient, params, preload),
	});
	const browseDatabaseRoute = createRoute({
		getParentRoute: () => instanceBrowseRoute,
		path: '$databaseName',
		loader: ({ context, params, preload }) => loadInstanceBrowseData(context.queryClient, params, preload),
	});
	const browseTableRoute = createRoute({
		getParentRoute: () => instanceBrowseRoute,
		path: '$databaseName/$tableName',
		component: BrowseDataTableView,
		loader: ({ context, params, preload }) => loadInstanceBrowseData(context.queryClient, params, preload),
	});

	return instanceBrowseRoute.addChildren([
		browseDatabaseRoute,
		browseTableRoute,
	]);
}
