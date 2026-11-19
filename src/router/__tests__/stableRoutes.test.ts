// @vitest-environment jsdom
import { CheckOAuth } from '@/features/auth/CheckOAuth';
import { ResetPassword } from '@/features/auth/ResetPassword';
import { SignIn } from '@/features/auth/SignIn';
import { SignUp } from '@/features/auth/SignUp';
import { VerifyEmail } from '@/features/auth/VerifyEmail';
import { ClusterHome } from '@/features/cluster/ClusterHome';
import { Instances } from '@/features/cluster/Instances';
import { Scaling } from '@/features/cluster/Scaling';
import { UsagePage } from '@/features/cluster/usage/Page';
import { ClustersList } from '@/features/clusters/ClustersList';
import { UpsertCluster } from '@/features/clusters/upsert';
// The lazy editor the route mounts, not the module behind it.
import { ApplicationsEditor, ApplicationsIndex } from '@/features/instance/applications/ApplicationsIndex';
import { ConfigDeploymentsIndex } from '@/features/instance/config/deployments';
import { Logs } from '@/features/instance/log';
import { PaymentMethodsDisplay } from '@/features/organization/billing/paymentMethod/PaymentMethodsDisplay';
import { OrganizationsIndex } from '@/features/organizations';
import { NewOrg } from '@/features/organizations/NewOrg';
import { rootRouteTree } from '@/router/rootRouteTree';
import { type StableExternalRoute, stableExternalRoutes } from '@/router/stableRoutes';
import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, createRouter } from '@tanstack/react-router';
import type { ComponentType } from 'react';
import { describe, expect, it } from 'vitest';

// Ids in the shapes central-manager hands out, so a route that only matches some shapes would show here.
const params: Record<string, string> = {
	organizationId: 'org-qpz5akmyrp1d0opj',
	clusterId: 'clu-tc9pqw20vrks2zik',
	instanceId: 'ins-tc9pqw20vrks2zik-1',
	deploymentId: 'v3',
};

const pages = {
	'/': OrganizationsIndex,
	'/new-org': NewOrg,
	'/{organizationId}': ClustersList,
	'/{organizationId}/new-cluster': UpsertCluster,
	'/{organizationId}/billing': PaymentMethodsDisplay,
	'/{organizationId}/{clusterId}': ClusterHome,
	'/{organizationId}/{clusterId}/instances': Instances,
	'/{organizationId}/{clusterId}/usage': UsagePage,
	'/{organizationId}/{clusterId}/scaling': Scaling,
	'/{organizationId}/{clusterId}/edit/version': UpsertCluster,
	'/{organizationId}/{clusterId}/apps': ApplicationsEditor,
	'/{organizationId}/{clusterId}/config/deployments': ConfigDeploymentsIndex,
	'/{organizationId}/{clusterId}/config/deployments/{deploymentId}': ConfigDeploymentsIndex,
	'/{organizationId}/{clusterId}/logs': Logs,
	'/{organizationId}/{clusterId}/instance/{instanceId}': ApplicationsIndex,
	'/sign-in': SignIn,
	'/sign-up': SignUp,
	'/check-oauth': CheckOAuth,
	'/verify-email': VerifyEmail,
	'/reset-password': ResetPassword,
} satisfies Record<StableExternalRoute, ComponentType>;

const placeholder = /\{(\w+)\}/g;

function resolve(template: StableExternalRoute) {
	const path = template.replace(placeholder, (_, name: string) => encodeURIComponent(params[name]));
	const router = createRouter({
		routeTree: rootRouteTree,
		history: createMemoryHistory({ initialEntries: [path] }),
		context: { queryClient: new QueryClient(), authentication: {} },
	});
	// Matching only: no guards or loaders run, so this checks the route tree and nothing else.
	const leaf = router.matchRoutes(router.state.location).at(-1)!;
	const route = (router.routesById as Record<string, { options: { component?: unknown } }>)[leaf.routeId];
	return { leaf, component: route.options.component };
}

describe('routes linked from outside Studio', () => {
	it.each(stableExternalRoutes)('%s still resolves to its page', (template) => {
		const { leaf, component } = resolve(template);

		expect(component).toBe(pages[template]);
		for (const [, name] of template.matchAll(placeholder)) {
			expect(leaf.params).toHaveProperty(name, params[name]);
		}
	});

	it('opens the version change on /edit/version', () => {
		expect(resolve('/{organizationId}/{clusterId}/edit/version').leaf.params).toHaveProperty('mode', 'version');
	});
});
