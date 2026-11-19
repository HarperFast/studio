/**
 * Studio routes that links from outside Studio point at, so they must keep resolving to the same page.
 *
 * Central-manager hands these out: the Harper Fabric MCP connector's tool results link people here whenever a change
 * has to be made in Studio (`src/lib/studioLinks.js`), its emails link to the account pages
 * (`src/constants/environment.js`), and its OAuth plugin sends sign-ins through `/sign-in` and `/check-oauth`
 * (`config.yaml`). Every one of those links is already out in the world, in agents' answers and people's inboxes.
 *
 * - Adding an entry is fine.
 * - Never change or remove one. To move a page, add its new path here, keep the old path as a route whose
 *   `beforeLoad` throws `redirect({ to, params })` to it, and move central-manager's link builders in step. The old
 *   entry stays: its check in `stableRoutes.test.ts` changes from the page to where `router.load()` lands.
 *
 * `{name}` is a path parameter, written the way central-manager's builders fill it in. Each path is a hash route:
 * the full link is `https://fabric.harper.fast/#` followed by it. `stableRoutes.test.ts` checks that each still
 * resolves to its page.
 */
export const stableExternalRoutes = [
	// The MCP connector: organizations and creating things.
	'/',
	'/new-org',
	'/{organizationId}',
	'/{organizationId}/new-cluster',
	'/{organizationId}/billing',
	// The MCP connector: one cluster.
	'/{organizationId}/{clusterId}',
	'/{organizationId}/{clusterId}/instances',
	'/{organizationId}/{clusterId}/usage',
	'/{organizationId}/{clusterId}/scaling',
	'/{organizationId}/{clusterId}/edit/version',
	'/{organizationId}/{clusterId}/apps',
	'/{organizationId}/{clusterId}/config/deployments',
	'/{organizationId}/{clusterId}/config/deployments/{deploymentId}',
	'/{organizationId}/{clusterId}/logs',
	'/{organizationId}/{clusterId}/instance/{instanceId}',
	// Central-manager's emails and sign-in flow.
	'/sign-in',
	'/sign-up',
	'/check-oauth',
	'/verify-email',
	'/reset-password',
] as const;

export type StableExternalRoute = (typeof stableExternalRoutes)[number];
