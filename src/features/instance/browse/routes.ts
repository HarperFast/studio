import { createRoute } from '@tanstack/react-router';
import { Browse } from '@/features/instance/browse/index';
import { BrowseDataTableView } from '@/features/instance/browse/components/BrowseDataTableView';
import { createInstanceLayoutRoute } from '@/features/instance/instanceLayoutRoute';
import { loadInstanceBrowseData } from '@/features/instance/browse/route.load';

export function createBrowseRouteTree(instanceLayoutRoute: ReturnType<typeof createInstanceLayoutRoute>) {
	const instanceBrowseRoute = createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: '/browse',
		component: Browse,
		loader: ({ context, params }) => loadInstanceBrowseData(context.queryClient, params),
	});
	const browseDatabaseRoute = createRoute({
		getParentRoute: () => instanceBrowseRoute,
		path: '$databaseName',
		loader: ({ context, params }) => loadInstanceBrowseData(context.queryClient, params),
	});
	const browseTableRoute = createRoute({
		getParentRoute: () => instanceBrowseRoute,
		path: '$databaseName/$tableName',
		component: BrowseDataTableView,
		loader: ({ context, params }) => loadInstanceBrowseData(context.queryClient, params),
	});

	return instanceBrowseRoute.addChildren([
		browseDatabaseRoute,
		browseTableRoute,
	]);
}
