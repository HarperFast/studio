// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORGANIZATION_ID = 'org-qmvwv3tdm45a9d4a';
const CLUSTER_ID = 'clu-xymqtds2k905g4v7';
const INSTANCE_ID = 'ins-xymqtds2k905g4v7-1';
const OVERVIEW = `/${ORGANIZATION_ID}/${CLUSTER_ID}`;
const SIGN_INS = {
	[CLUSTER_ID]: 'https://cluster.example.com:9925/',
	[INSTANCE_ID]: 'https://ins-1.example.com:9925/',
};
const cloudUser = {
	id: 'usr_a',
	email: 'a@example.com',
	roles: { [ORGANIZATION_ID]: { permission: { super_user: true } } },
};

const { getInstanceUserInfo, registrationInfo, createInstanceAuthenticationTokens, routers } = vi.hoisted(() => ({
	getInstanceUserInfo: vi.fn(),
	registrationInfo: vi.fn(),
	createInstanceAuthenticationTokens: vi.fn(),
	routers: new Set<{ history: { destroy: () => void } }>(),
}));

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() }) }));
vi.mock('@tanstack/react-router-devtools', () => ({ TanStackRouterDevtools: () => null }));
vi.mock('@/features/notifications/NotificationsSubscriptionManager', () => ({
	NotificationsSubscriptionManager: () => null,
}));
vi.mock('@/components/NotificationBanner', () => ({ NotificationBanner: () => null }));
vi.mock('@/components/Navbar', () => ({ Navbar: () => null }));
vi.mock('@/features/search/GlobalSearch', () => ({
	GlobalSearch: ({ children }: { children: unknown }) => children,
	GlobalSearchTrigger: () => null,
}));
vi.mock('@/integrations/api/instance/status/getInstanceUserInfo', () => ({ getInstanceUserInfo }));
vi.mock('@/integrations/api/instance/auth/createInstanceAuthenticationTokens', async (importOriginal) => ({
	...await importOriginal<object>(),
	createInstanceAuthenticationTokens,
}));
vi.mock('@/integrations/api/instance/status/getRegistrationInfo', () => ({
	getRegistrationInfoQueryOptions: ({ entityId }: { entityId: string }) => ({
		queryKey: ['registration_info', entityId],
		queryFn: registrationInfo,
		retry: false,
	}),
}));

/**
 * Mocks whose factories import app modules. A `vi.mock` factory's result outlives `resetModules`, so these are
 * registered again after each reset.
 */
function mockAppModules() {
	vi.doMock('@/integrations/datadog/datadog', async (importOriginal) => ({
		...await importOriginal<typeof import('@/integrations/datadog/datadog')>(),
		useOnRouteLoadTracker: () => undefined,
	}));
	vi.doMock('@/router/useNewRouter', async (importOriginal) => {
		const { useNewRouter } = await importOriginal<typeof import('@/router/useNewRouter')>();
		return {
			useNewRouter: (...args: Parameters<typeof useNewRouter>) => {
				const router = useNewRouter(...args);
				routers.add(router);
				return router;
			},
		};
	});
}

// Transformed here, while the file is collected, which has no timeout, rather than inside the first test's 5s.
mockAppModules();
await import('@/AppRouted');

function respond(config: InternalAxiosRequestConfig, data: unknown) {
	return { status: 200, statusText: '200', data, headers: {}, config };
}

/** A page load on a bookmark, through the real `AppRouted` and route tree, with the store reading storage afresh. */
async function openBookmark(path: string) {
	window.history.replaceState(null, '', `#${path}`);
	vi.resetModules();
	mockAppModules();
	const [{ apiClient }, { queryClient }, { AppRouted }] = await Promise.all([
		import('@/config/apiClient'),
		import('@/react-query/queryClient'),
		import('@/AppRouted'),
	]);
	apiClient.defaults.adapter = async (config) => {
		if (config.url === '/User/current') {
			return respond(config, cloudUser);
		}
		if (config.url === `/Organization/${ORGANIZATION_ID}`) {
			return respond(config, { id: ORGANIZATION_ID, name: 'Acme', clusters: [] });
		}
		if (config.url === `/Cluster/${CLUSTER_ID}`) {
			return respond(config, {
				id: CLUSTER_ID,
				organizationId: ORGANIZATION_ID,
				name: 'prod',
				status: 'TERMINATED',
				terminatedAt: '2026-10-12T00:00:00.000Z',
				instances: [{ id: INSTANCE_ID, status: 'TERMINATING' }],
			});
		}
		throw new Error(`unexpected request ${config.url}`);
	};
	render(
		<QueryClientProvider client={queryClient}>
			<AppRouted />
		</QueryClientProvider>,
	);
}

function rememberedEntities() {
	const markers = JSON.parse(localStorage.getItem('Studio:PotentiallyAuthenticated') || '{}');
	return Object.keys(SIGN_INS).filter((id) =>
		markers[id] || localStorage.getItem(`Studio:BasicAuth:${id}`) || localStorage.getItem(`Studio:FabricConnect:${id}`)
	);
}

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	localStorage.setItem(
		'Studio:PotentiallyAuthenticated',
		JSON.stringify({ OverallAppSignIn: 'OverallAppSignIn', ...SIGN_INS }),
	);
	for (const id of Object.keys(SIGN_INS)) {
		localStorage.setItem(`Studio:BasicAuth:${id}`, btoa(JSON.stringify({ username: 'admin', password: 'hunter2' })));
		localStorage.setItem(`Studio:FabricConnect:${id}`, 'true');
	}
	// A host that still answers: a removed self-hosted cluster's own server.
	getInstanceUserInfo.mockResolvedValue({ username: 'admin' });
	registrationInfo.mockResolvedValue({ version: '5.2.0' });
	createInstanceAuthenticationTokens.mockResolvedValue({ operationToken: 'token' });
	vi.spyOn(console, 'error').mockImplementation(() => undefined);
	vi.spyOn(console, 'debug').mockImplementation(() => undefined);
});

afterEach(() => {
	cleanup();
	for (const router of routers) {
		router.history.destroy();
	}
	routers.clear();
	vi.clearAllMocks();
	vi.restoreAllMocks();
});

describe('a bookmark into a terminated cluster, rendered through the whole app', () => {
	it.each(['logs', `instance/${INSTANCE_ID}/logs`])(
		'shows /%s as the terminated overview, contacts no host, and forgets every sign-in',
		async (page) => {
			await openBookmark(`${OVERVIEW}/${page}`);

			expect(await screen.findByRole('heading', { name: 'Cluster Terminated' }, { timeout: 4000 })).toBeTruthy();
			await vi.waitFor(() => expect(rememberedEntities()).toEqual([]));
			expect(window.location.hash).toBe(`#${OVERVIEW}`);
			expect(getInstanceUserInfo).not.toHaveBeenCalled();
			expect(createInstanceAuthenticationTokens).not.toHaveBeenCalled();
			expect(registrationInfo).not.toHaveBeenCalled();
		},
	);
});
