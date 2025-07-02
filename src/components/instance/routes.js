import { lazy, React } from 'react';

import Browse from './browse';
import config from '../../config';
import supportsApplications from '../../functions/instance/functions/supportsApplications';
// NOTE: Temporarily disabling. Query is used in Charts.
// const Charts = lazy(() => import(/* webpackChunkName: "instance-charts" */ './charts'));
// NOTE: Temporarily disabling. The SQL engine in HarperDB is not optimized and when users use it, it can create significant production issues.
// const Query = lazy(() => import(/* webpackChunkName: "instance-query" */ './query'));
const Cluster = lazy(() => import(/* webpackChunkName: "instance-cluster" */ './replication'));
const Config = lazy(() => import(/* webpackChunkName: "instance-config" */ './config'));
const Metrics = lazy(() => import(/* webpackChunkName: "instance-status" */ './status'));
const LogsIndex = lazy(() => import(/* webpackChunkName: "instance-logs" */ './logs'));
const Users = lazy(() => import(/* webpackChunkName: "instance-users" */ './users'));
const Roles = lazy(() => import(/* webpackChunkName: "instance-roles" */ './roles'));
const Functions = lazy(() => import(/* webpackChunkName: "custom-functions" */ './functions'));

const routes = ({ super_user, version = null }) => {
	const useApplications = supportsApplications({ version });

	const browse = {
		element: <Browse />,
		path: `browse/:schema?/:table?/:action?/:hash?`,
		link: 'browse',
		label: 'browse',
		icon: 'list',
	};

	// NOTE: Temporarily disabling. The SQL engine in HarperDB is not optimized and when users use it, it can create significant production issues.
	// const query = {
	//   element: <Query />,
	//   path: `query`,
	//   link: 'query',
	//   label: 'query',
	//   icon: 'search',
	// };

	const users = {
		element: <Users />,
		path: `users/:username?`,
		link: 'users',
		label: 'users',
		icon: 'users',
	};

	const roles = {
		element: <Roles />,
		path: `roles/:role_id?`,
		link: 'roles',
		label: 'roles',
		icon: 'check-square',
	};

	// NOTE: Temporarily disabling. Query is used in Charts.
	// const charts = {
	//   element: <Charts />,
	//   path: `charts`,
	//   link: 'charts',
	//   label: 'charts',
	//   icon: 'chart-line',
	// };

	const cluster = {
		element: <Cluster />,
		path: `replication`,
		link: 'replication',
		label: 'replication',
		icon: 'cubes',
	};

	const functions = {
		element: <Functions />,
		path: `functions/:action?/:project?/:type?/:file?`,
		link: 'functions',
		label: 'functions',
		icon: 'project-diagram',
	};

	const applications = {
		element: <Functions />,
		path: 'applications',
		link: 'applications',
		label: 'applications',
		icon: 'project-diagram',
	};

	const metrics = {
		element: <Metrics />,
		path: `status`,
		link: 'status',
		label: 'status',
		icon: 'tachometer-alt',
	};
	const logs = {
		element: <LogsIndex />,
		path: `logs`,
		link: 'logs',
		label: 'logs',
		icon: 'tachometer-alt',
	};

	const configure = {
		element: <Config />,
		path: `config`,
		link: 'config',
		label: 'config',
		icon: 'wrench',
	};

	if (config.is_local_studio && super_user) {
		return [browse, users, roles, cluster, useApplications ? applications : functions, metrics, configure, logs];
	}

	if (super_user) {
		return [browse, users, roles, cluster, useApplications ? applications : functions, metrics, configure, logs];
	}

	if (config.is_local_studio) {
		return [browse];
	}

	return [browse];
};
export default routes;
