import { ConfigBackupsIndex } from '@/features/instance/config/backups';
import { ConfigCertificatesIndex } from '@/features/instance/config/certificates';
import { ConfigDeployFromGitHubIndex } from '@/features/instance/config/deployFromGitHub';
import { validateDeployFromGitHubSearch } from '@/features/instance/config/deployFromGitHub/deployFromGitHubSearch';
import { ConfigDeploymentsIndex } from '@/features/instance/config/deployments';
import { validateDeploymentsSearch } from '@/features/instance/config/deployments/deploymentsSearch';
import { ConfigDomainsIndex } from '@/features/instance/config/domains';
import { ConfigIndex } from '@/features/instance/config/index';
import { ConfigOverviewIndex } from '@/features/instance/config/overview';
import { ConfigPreviewsIndex } from '@/features/instance/config/previews';
import { validatePreviewsSearch } from '@/features/instance/config/previews/previewsSearch';
import { ConfigRolesIndex } from '@/features/instance/config/roles';
import { ConfigScheduledJobsIndex } from '@/features/instance/config/scheduledJobs';
import { ConfigSecretsIndex } from '@/features/instance/config/secrets';
import { ConfigSSHKeysIndex } from '@/features/instance/config/sshKeys';
import { ConfigTrustPoliciesIndex } from '@/features/instance/config/trustPolicies';
import { ConfigUsersIndex } from '@/features/instance/config/users';
import { ConfigWafIndex } from '@/features/instance/config/waf';
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

	const instanceConfigBackupsRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'backups',
		head: () => ({ meta: [{ title: 'Backups — Harper Fabric' }] }),
		component: ConfigBackupsIndex,
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

	const instanceConfigWafRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'firewall',
		head: () => ({ meta: [{ title: 'Firewall — Harper Fabric' }] }),
		component: ConfigWafIndex,
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
		validateSearch: validateDeploymentsSearch,
		head: () => ({ meta: [{ title: 'Deployments — Harper Fabric' }] }),
		component: ConfigDeploymentsIndex,
	});
	const instanceConfigDeploymentRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'deployments/$deploymentId',
		validateSearch: validateDeploymentsSearch,
		head: () => ({ meta: [{ title: 'Deployments — Harper Fabric' }] }),
		component: ConfigDeploymentsIndex,
	});

	const instanceConfigDeployFromGitHubRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'deploy-from-github',
		validateSearch: validateDeployFromGitHubSearch,
		head: () => ({ meta: [{ title: 'Deploy from GitHub — Harper Fabric' }] }),
		component: ConfigDeployFromGitHubIndex,
	});

	const instanceConfigPreviewsRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'previews',
		validateSearch: validatePreviewsSearch,
		head: () => ({ meta: [{ title: 'Previews — Harper Fabric' }] }),
		component: ConfigPreviewsIndex,
	});

	const instanceConfigScheduledJobsRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'scheduled-jobs',
		head: () => ({ meta: [{ title: 'Scheduled Jobs — Harper Fabric' }] }),
		component: ConfigScheduledJobsIndex,
		loader: registrationInfoLoader,
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

	const instanceConfigTrustPoliciesRoute = createRoute({
		getParentRoute: () => instanceConfigRoute,
		path: 'trust-policies',
		head: () => ({ meta: [{ title: 'Trust Policies — Harper Fabric' }] }),
		component: ConfigTrustPoliciesIndex,
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

		instanceConfigBackupsRoute,

		instanceConfigRolesRoute,
		instanceConfigRoleRoute,

		instanceConfigUsersRoute,
		instanceConfigUserRoute,

		instanceConfigDomainsRoute,

		instanceConfigWafRoute,

		instanceConfigDeploymentsRoute,
		instanceConfigDeploymentRoute,

		instanceConfigDeployFromGitHubRoute,

		instanceConfigPreviewsRoute,

		instanceConfigSSHKeysRoute,
		instanceConfigSSHKeyRoute,

		instanceConfigScheduledJobsRoute,

		instanceConfigSecretsRoute,
		instanceConfigSecretRoute,

		instanceConfigTrustPoliciesRoute,

		instanceConfigCertificatesRoute,
		instanceConfigCertificateRoute,
	]);
}
