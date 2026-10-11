/** @vitest-environment jsdom */
import { renderHook, waitFor } from '@testing-library/react';
import type { AxiosInstance } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { get, getInstanceUserInfo, createInstanceAuthenticationTokens, onInstanceLogoutSubmit, routeParams } = vi
	.hoisted(() => ({
		get: vi.fn(),
		getInstanceUserInfo: vi.fn(),
		createInstanceAuthenticationTokens: vi.fn(),
		onInstanceLogoutSubmit: vi.fn(),
		routeParams: {} as { clusterId?: string; instanceId?: string },
	}));
vi.mock('@/config/apiClient', () => ({ apiClient: { get, defaults: { baseURL: 'https://cm.example.com' } } }));
vi.mock('@/integrations/api/instance/status/getInstanceUserInfo', () => ({ getInstanceUserInfo }));
vi.mock('@/integrations/api/instance/auth/createInstanceAuthenticationTokens', () => ({
	createInstanceAuthenticationTokens,
	refreshInstanceOperationToken: vi.fn(),
}));
vi.mock('@/integrations/api/instance/auth/onInstanceLogoutSubmit', () => ({ onInstanceLogoutSubmit }));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
	...await importOriginal<typeof import('@tanstack/react-router')>(),
	useParams: () => routeParams,
}));

// Two clusters remembered from earlier visits, each in a different organization. The store holds no
// organization for an entity, only the operations URL it was signed in under.
const OTHER_ORG_CLUSTER = 'clu-other-org';
const OTHER_ORG_URL = 'https://other-org.example.com:9925/';
const THIS_ORG_CLUSTER = 'clu-this-org';
const THIS_ORG_URL = 'https://this-org.example.com:9925/';

const flush = () => new Promise((resolve) => setTimeout(resolve, 5));

/** The store reads its markers once, at construction — so a fresh module is a page reload. */
async function reloadPage() {
	vi.resetModules();
	return import('./authStore');
}

function checkedUrls(): string[] {
	return getInstanceUserInfo.mock.calls.map(([config]) =>
		(config as { instanceClient: AxiosInstance }).instanceClient.defaults.baseURL ?? ''
	);
}

function guardParams(clusterId: string) {
	return { organizationId: 'org-this', clusterId };
}

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	localStorage.setItem(
		'Studio:PotentiallyAuthenticated',
		JSON.stringify({
			OverallAppSignIn: 'OverallAppSignIn',
			[OTHER_ORG_CLUSTER]: OTHER_ORG_URL,
			[THIS_ORG_CLUSTER]: THIS_ORG_URL,
		}),
	);
	get.mockResolvedValue({ data: { id: 'cloud-user' } });
	getInstanceUserInfo.mockResolvedValue({ username: 'admin' });
	onInstanceLogoutSubmit.mockResolvedValue({ message: 'ok' });
	routeParams.clusterId = undefined;
	routeParams.instanceId = undefined;
});

afterEach(() => {
	vi.resetAllMocks();
});

describe('which remembered sign-ins a page load checks (#1329)', () => {
	it('checks the app sign-in, and no remembered cluster, when the root subscribes', async () => {
		const { authStore } = await reloadPage();

		authStore.listenToAllEntities(() => undefined);
		await flush();

		expect(get).toHaveBeenCalledTimes(1);
		expect(getInstanceUserInfo).not.toHaveBeenCalled();
	});

	it('checks a remembered cluster once something shows it, and tells the root', async () => {
		const { authStore } = await reloadPage();
		const rootUpdates: string[] = [];
		authStore.listenToAllEntities((_connection, id) => rootUpdates.push(id));

		// Two cards for the same cluster mounting together share the one check.
		authStore.listenToEntity(THIS_ORG_CLUSTER, () => undefined);
		authStore.listenToEntity(THIS_ORG_CLUSTER, () => undefined);
		await flush();

		expect(checkedUrls()).toEqual([THIS_ORG_URL]);
		expect(authStore.getConnectionById(THIS_ORG_CLUSTER)).toEqual({ isLoading: false, user: { username: 'admin' } });
		// The root context is what invalidates the router, which re-runs the instance guards.
		expect(rootUpdates).toContain(THIS_ORG_CLUSTER);
		expect(authStore.getConnectionById(OTHER_ORG_CLUSTER)).toEqual({ isLoading: true, user: null });
	});

	it('checks the other cluster when its organization is opened, and each one only once', async () => {
		const { authStore } = await reloadPage();
		authStore.listenToAllEntities(() => undefined);
		authStore.listenToEntity(THIS_ORG_CLUSTER, () => undefined);
		await flush();

		authStore.listenToEntity(OTHER_ORG_CLUSTER, () => undefined);
		authStore.listenToEntity(THIS_ORG_CLUSTER, () => undefined);
		await flush();

		expect(checkedUrls()).toEqual([THIS_ORG_URL, OTHER_ORG_URL]);
		expect(authStore.getConnectionById(OTHER_ORG_CLUSTER).user).toEqual({ username: 'admin' });
	});

	it('still forgets a remembered cluster whose session has ended, once it is checked', async () => {
		getInstanceUserInfo.mockRejectedValueOnce(new Error('401'));
		vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const { authStore } = await reloadPage();

		authStore.listenToEntity(OTHER_ORG_CLUSTER, () => undefined);
		await flush();

		expect(authStore.getConnectionById(OTHER_ORG_CLUSTER)).toEqual({ isLoading: false, user: null });
		expect(authStore.getOperationsUrl(OTHER_ORG_CLUSTER)).toBeUndefined();
		expect(authStore.getOperationsUrl(THIS_ORG_CLUSTER)).toBe(THIS_ORG_URL);
	});

	it('still signs out of a remembered cluster that was never checked', async () => {
		const { authStore } = await reloadPage();
		authStore.listenToAllEntities(() => undefined);
		await flush();

		await authStore.signOutFromPotentiallyAuthenticatedInstances();

		expect(onInstanceLogoutSubmit.mock.calls.map(([{ entityId }]) => entityId).sort())
			.toEqual([OTHER_ORG_CLUSTER, THIS_ORG_CLUSTER]);
		expect(localStorage.getItem('Studio:PotentiallyAuthenticated')).toBe('{}');
	});

	it('checks the entity of the route a component is on when it names none', async () => {
		const { authStore } = await reloadPage();
		const { useInstanceAuth } = await import('@/hooks/useAuth');
		routeParams.clusterId = THIS_ORG_CLUSTER;

		const { result } = renderHook(() => useInstanceAuth());

		await waitFor(() => expect(result.current.user).toEqual({ username: 'admin' }));
		expect(checkedUrls()).toEqual([THIS_ORG_URL]);
		expect(authStore.getConnectionById(OTHER_ORG_CLUSTER).isLoading).toBe(true);
	});

	it('returns the new entity at once when the route moves to another one already checked', async () => {
		const { authStore } = await reloadPage();
		const { useInstanceAuth } = await import('@/hooks/useAuth');
		getInstanceUserInfo.mockImplementation(async ({ instanceClient }: { instanceClient: AxiosInstance }) => ({
			username: instanceClient.defaults.baseURL === OTHER_ORG_URL ? 'other' : 'this',
		}));
		authStore.listenToEntity(OTHER_ORG_CLUSTER, () => undefined);
		routeParams.clusterId = THIS_ORG_CLUSTER;
		const { result, rerender } = renderHook(() => useInstanceAuth());
		await waitFor(() => expect(result.current.user).toEqual({ username: 'this' }));

		routeParams.clusterId = OTHER_ORG_CLUSTER;
		rerender();

		expect(result.current.user).toEqual({ username: 'other' });
	});
});

describe('the instance guard, now that nothing checks a deep-linked entity ahead of it', () => {
	it('starts checking the cluster a deep link opens, and does not redirect while it is pending', async () => {
		const { authStore } = await reloadPage();
		const { checkClusterInstanceAuthenticationBeforeLoad } = await import('@/features/instance/instanceLayoutRoute');

		await expect(checkClusterInstanceAuthenticationBeforeLoad({
			context: { authentication: { ...authStore.getAllConnections() } },
			params: guardParams(THIS_ORG_CLUSTER),
		})).resolves.toBeUndefined();
		await flush();

		expect(checkedUrls()).toEqual([THIS_ORG_URL]);
		expect(authStore.getConnectionById(THIS_ORG_CLUSTER).user).toEqual({ username: 'admin' });
	});

	it('sends no check of its own after re-establishing Fabric Connect on a reload', async () => {
		localStorage.setItem(`Studio:FabricConnect:${THIS_ORG_CLUSTER}`, 'true');
		createInstanceAuthenticationTokens.mockResolvedValue({ operationToken: 'jwt' });
		const { authStore } = await reloadPage();
		const { checkClusterInstanceAuthenticationBeforeLoad } = await import('@/features/instance/instanceLayoutRoute');

		await checkClusterInstanceAuthenticationBeforeLoad({
			context: { authentication: { ...authStore.getAllConnections() } },
			params: guardParams(THIS_ORG_CLUSTER),
		});
		await flush();

		// The establish's own probe, through the proxy — not a second user_info from the store.
		expect(checkedUrls()).toEqual([`https://cm.example.com/Cluster/${THIS_ORG_CLUSTER}/operation`]);
		expect(authStore.getConnectionById(THIS_ORG_CLUSTER).user).toEqual({ username: 'admin' });
	});
});
