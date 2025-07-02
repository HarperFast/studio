import { createRoute, redirect } from '@tanstack/react-router';
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
import { isLocalStudio } from '@/config/constants';
import { getDescribeAllQueryOptions } from '@/features/instance/operations/queries/getDescribeAll';
import { QueryClient } from '@tanstack/react-query';

export const instanceLayoutRoute = isLocalStudio
	? createRoute({
		getParentRoute: () => dashboardLayout,
		id: '_instanceLayout',
		component: InstanceLayout,
		loader: () => {
			// TODO: Load instance information?
		},
	})
	: createRoute({
		getParentRoute: () => clusterLayoutRoute,
		path: 'instance/$instanceId',
		component: InstanceLayout,
		loader: async (opts) => {
			return await opts.context.queryClient.ensureQueryData(getInstanceInfoQueryOptions(opts.params.instanceId));
		},
	});

const instanceIndexRoute = createRoute({
	getParentRoute: () => instanceLayoutRoute,
	path: '/',
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

async function loadInstanceBrowseData(queryClient: QueryClient, params: {
	instanceId?: string;
	schemaName?: string;
	tableName?: string;
}) {
	const data = await queryClient.ensureQueryData(getDescribeAllQueryOptions(params.instanceId));
	let newSchemaName: string | undefined;
	let newTableName: string | undefined;
	if (data) {
		if (!params.schemaName) {
			newSchemaName = Object.keys(data).sort()[0];
		}
		const schemaName = params.schemaName ?? newSchemaName;
		if (!params.tableName && schemaName && data[schemaName]) {
			newTableName = Object.keys(data[schemaName]).sort()[0];
		}
	}
	if (newSchemaName || newTableName) {
		const to = [
			params.schemaName ? '..' : '',
			params.tableName ? '..' : '',
			newSchemaName ?? params.schemaName,
			newTableName,
		].filter(Boolean).join('/');
		throw redirect({ to });
	}
	return data;
}

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

export const instanceRouteTree = [
	instanceIndexRoute,
	instanceBrowseRoute.addChildren([browseDatabaseRoute, browseTableRoute, instanceLogsRoute]),
	instanceApplicationsIndexRoute,
	instanceApplicationsNewRoute,
	instanceApplicationsEditorRoute,
	instanceConfigRoute.addChildren([instanceOverviewRoute, instanceConfigRolesRoute, instanceConfigUsersRoute]),
];
