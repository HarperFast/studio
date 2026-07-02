import { ConfigCertificatesIndex } from '@/features/instance/config/certificates';
import { ConfigDeploymentsIndex } from '@/features/instance/config/deployments';
import { ConfigDomainsIndex } from '@/features/instance/config/domains';
import { ConfigIndex } from '@/features/instance/config/index';
import { ConfigOverviewIndex } from '@/features/instance/config/overview';
import { ConfigRolesIndex } from '@/features/instance/config/roles';
import { ConfigSecretsIndex } from '@/features/instance/config/secrets';
import { ConfigSSHKeysIndex } from '@/features/instance/config/sshKeys';
import { ConfigUsersIndex } from '@/features/instance/config/users';
import { createInstanceLayoutRoute } from '@/features/instance/instanceLayoutRoute';
import { registrationInfoLoader } from '@/features/instance/registrationInfoLoader';
import { createRoute } from '@tanstack/react-router';

export function createConfigRouteTree(instanceLayoutRoute: ReturnType<typeof createInstanceLayoutRoute>) {
	const instanceConfigRoute = createRoute({
		getParentRoute: () => instanceLayoutRoute,
		path: 'config',
		head: () => ({ meta: [{ title: 'Config — Harper Fabric' }] }),
		component: ConfigIndex,
		loader: registrationInfoLoader,
	});
	const instanceOverviewRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: '/',
		head: () => ({ meta: [{ title: 'Overview — Harper Fabric' }] }),
		component: ConfigOverviewIndex,
		loader: registrationInfoLoader,
	});

	const instanceConfigRolesRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'roles',
		head: () => ({ meta: [{ title: 'Instance Roles — Harper Fabric' }] }),
		component: ConfigRolesIndex,
	});
	const instanceConfigRoleRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'roles/$roleId',
		head: () => ({ meta: [{ title: 'Instance Roles — Harper Fabric' }] }),
		component: ConfigRolesIndex,
	});

	const instanceConfigUsersRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'users',
		head: () => ({ meta: [{ title: 'Instance Users — Harper Fabric' }] }),
		component: ConfigUsersIndex,
	});
	const instanceConfigUserRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'users/$username',
		head: () => ({ meta: [{ title: 'Instance Users — Harper Fabric' }] }),
		component: ConfigUsersIndex,
	});

	const instanceConfigDomainsRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'domains',
		head: () => ({ meta: [{ title: 'Instance Domains — Harper Fabric' }] }),
		component: ConfigDomainsIndex,
	});

	const instanceConfigSSHKeysRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'ssh-keys',
		head: () => ({ meta: [{ title: 'SSH Keys — Harper Fabric' }] }),
		component: ConfigSSHKeysIndex,
	});
	const instanceConfigSSHKeyRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'ssh-keys/$keyName',
		head: () => ({ meta: [{ title: 'SSH Keys — Harper Fabric' }] }),
		component: ConfigSSHKeysIndex,
	});

	const instanceConfigDeploymentsRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'deployments',
		head: () => ({ meta: [{ title: 'Deployments — Harper Fabric' }] }),
		component: ConfigDeploymentsIndex,
	});
	const instanceConfigDeploymentRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'deployments/$deploymentId',
		head: () => ({ meta: [{ title: 'Deployments — Harper Fabric' }] }),
		component: ConfigDeploymentsIndex,
	});

	const instanceConfigSecretsRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'secrets',
		head: () => ({ meta: [{ title: 'Secrets — Harper Fabric' }] }),
		component: ConfigSecretsIndex,
	});
	const instanceConfigSecretRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'secrets/$secretName',
		head: () => ({ meta: [{ title: 'Secrets — Harper Fabric' }] }),
		component: ConfigSecretsIndex,
	});

	const instanceConfigCertificatesRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'certificates',
		head: () => ({ meta: [{ title: 'Certificates — Harper Fabric' }] }),
		component: ConfigCertificatesIndex,
	});
	const instanceConfigCertificateRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'certificates/$certName',
		head: () => ({ meta: [{ title: 'Certificates — Harper Fabric' }] }),
		component: ConfigCertificatesIndex,
	});

	return instanceConfigRoute.addChildren([
		instanceOverviewRoute,

		instanceConfigRolesRoute,
		instanceConfigRoleRoute,

		instanceConfigUsersRoute,
		instanceConfigUserRoute,

		instanceConfigDomainsRoute,

		instanceConfigDeploymentsRoute,
		instanceConfigDeploymentRoute,

		instanceConfigSSHKeysRoute,
		instanceConfigSSHKeyRoute,

		instanceConfigSecretsRoute,
		instanceConfigSecretRoute,

		instanceConfigCertificatesRoute,
		instanceConfigCertificateRoute,
	]);
}
