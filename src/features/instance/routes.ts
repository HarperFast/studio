import { createRoute } from '@tanstack/react-router';
import { clusterLayoutRoute } from '@/features/cluster/routes';
import { InstanceLayout } from '@/features/instance/InstanceLayout';
import { getInstanceInfoQueryOptions } from '@/features/instance/queries/getInstanceInfoQuery';
import { Browse } from '@/features/instance/browse';
import { BrowseDataTableView } from '@/features/instance/browse/BrowseDataTableView';
import { Logs } from '@/features/instance/log';
import { ApplicationsIndex } from '@/features/instance/applications';
import { NewApplications } from '@/features/instance/applications/new';
import { EditApplications } from '@/features/instance/applications/editor';
import { ConfigIndex } from '@/features/instance/config';
import { ConfigOverviewIndex } from '@/features/instance/config/overview';
import { ConfigRolesIndex } from '@/features/instance/config/roles';
import { ConfigUsersIndex } from '@/features/instance/config/users';
import { dashboardLayout } from '@/router/dashboardRoute';
import { loadInstanceBrowseData } from '@/features/instance/browse/route.load';

export function createInstanceRouteTree(mode: 'local' | 'cluster' | 'instance') {
	const instanceLayoutRoute = mode === 'local'
		? createRoute({
			getParentRoute: () => dashboardLayout,
			id: '_instanceLayout',
			component: InstanceLayout,
		})
		: mode === 'cluster'
			? createRoute({
				getParentRoute: () => clusterLayoutRoute,
				id: '_instanceLayout',
				component: InstanceLayout,
				beforeLoad: async ({ context, params }) => {
					// "beforeLoad" must resolve before "loader"s are invoked in parallel, which is perfect, because we need
					// it to set our instanceClient baseURL!
					return await context.queryClient.ensureQueryData(getInstanceInfoQueryOptions(params.clusterId));
				},
			})
			: createRoute({
				getParentRoute: () => clusterLayoutRoute,
				path: 'instance/$instanceId',
				component: InstanceLayout,
				beforeLoad: async ({ context, params }) => {
					// "beforeLoad" must resolve before "loader"s are invoked in parallel, which is perfect, because we need
					// it to set our instanceClient baseURL!
					return await context.queryClient.ensureQueryData(getInstanceInfoQueryOptions(params.clusterId, params.instanceId));
				},
			});

	const instanceIndexRoute = createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: mode === 'cluster' ? '/index' : '/',
		component: Browse,
	});

	const instanceBrowseRoute = createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: '/browse',
		component: Browse,
		loader: ({ context, params }) => loadInstanceBrowseData(context.queryClient, params),
	});
	const browseDatabaseRoute = createRoute({
		getParentRoute: () => instanceBrowseRoute,
		path: '$schemaName',
		loader: ({ context, params }) => loadInstanceBrowseData(context.queryClient, params),
	});
	const browseTableRoute = createRoute({
		getParentRoute: () => instanceBrowseRoute,
		path: '$schemaName/$tableName',
		component: BrowseDataTableView,
		loader: ({ context, params }) => loadInstanceBrowseData(context.queryClient, params),
	});

	const instanceLogsRoute = createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: 'logs',
		component: Logs,
	});

	const instanceApplicationsIndexRoute = createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: 'applications',
		component: ApplicationsIndex,
	});

	const instanceApplicationsNewRoute = createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: 'applications/new',
		component: NewApplications,
	});

	const instanceApplicationsEditorRoute = createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: 'applications/editor',
		component: EditApplications,
	});

	const instanceConfigRoute = createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: 'config',
		component: ConfigIndex,
	});
	const instanceOverviewRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: '/',
		component: ConfigOverviewIndex,
	});
	const instanceConfigRolesRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'roles',
		component: ConfigRolesIndex,
	});
	const instanceConfigUsersRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'users',
		component: ConfigUsersIndex,
	});

	const children = [
		instanceIndexRoute,
		instanceBrowseRoute.addChildren([
			browseDatabaseRoute,
			browseTableRoute,
			instanceLogsRoute,
		]),
		instanceApplicationsIndexRoute,
		instanceApplicationsNewRoute,
		instanceApplicationsEditorRoute,
		instanceConfigRoute.addChildren([
			instanceOverviewRoute,
			instanceConfigRolesRoute,
			instanceConfigUsersRoute,
		]),
	];

	return instanceLayoutRoute.addChildren(children);
}
