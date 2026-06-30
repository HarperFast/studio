/** @vitest-environment jsdom */
import { authStore } from '@/features/auth/store/authStore';
import { LocalUser } from '@/integrations/api/api.patch';
import { afterEach, describe, expect, it } from 'vitest';
import { redirectAwayFromInstanceSignInIfConnected, redirectAwayFromSignInIfConnected } from './routes';

const CLUSTER_ID = 'clu-1333';
const INSTANCE_ID = 'ins-1333';
const KEY = 'https://instance.example.com:9925/';
const user = { username: 'admin' } as LocalUser;

function setConnectedUser(id: string) {
	authStore.setUserForIdAndKey(id, KEY, user);
}

function clearConnection(id: string) {
	authStore.setUserForIdAndKey(id, KEY, null);
	authStore.flagForFabricConnect(id, false);
}

afterEach(() => {
	clearConnection(CLUSTER_ID);
	clearConnection(INSTANCE_ID);
	localStorage.clear();
});

describe('redirectAwayFromSignInIfConnected (cluster)', () => {
	it('shows the form (no redirect) when there is no connection', () => {
		expect(() => redirectAwayFromSignInIfConnected({ params: { clusterId: CLUSTER_ID } })).not.toThrow();
	});

	it('redirects away when already directly connected', () => {
		setConnectedUser(CLUSTER_ID);
		expect(() => redirectAwayFromSignInIfConnected({ params: { clusterId: CLUSTER_ID } })).toThrow();
	});

	it('shows the form when connected via Fabric Connect (so the user can sign in directly)', () => {
		setConnectedUser(CLUSTER_ID);
		authStore.flagForFabricConnect(CLUSTER_ID, true);
		expect(() => redirectAwayFromSignInIfConnected({ params: { clusterId: CLUSTER_ID } })).not.toThrow();
	});

	it('reads live auth state: a synchronously-cleared user does not redirect (the #1333 race)', () => {
		setConnectedUser(CLUSTER_ID);
		// Simulates "Direct Sign In" clearing the connection right before navigation. The router-context
		// snapshot would still hold the old user, but the live store does not — so we must not redirect.
		authStore.setUserForIdAndKey(CLUSTER_ID, KEY, null);
		expect(() => redirectAwayFromSignInIfConnected({ params: { clusterId: CLUSTER_ID } })).not.toThrow();
	});

	it('honors an absolute redirect target', () => {
		setConnectedUser(CLUSTER_ID);
		try {
			redirectAwayFromSignInIfConnected({
				params: { clusterId: CLUSTER_ID },
				location: { search: { redirect: '/some/path' } },
			});
			expect.unreachable('expected a redirect');
		} catch (thrown) {
			expect((thrown as { options?: { to?: string } }).options?.to).toBe('/some/path');
		}
	});
});

describe('redirectAwayFromInstanceSignInIfConnected (instance)', () => {
	it('shows the form (no redirect) when there is no connection', () => {
		expect(() =>
			redirectAwayFromInstanceSignInIfConnected({ params: { clusterId: CLUSTER_ID, instanceId: INSTANCE_ID } })
		).not.toThrow();
	});

	it('redirects away when already directly connected', () => {
		setConnectedUser(INSTANCE_ID);
		expect(() =>
			redirectAwayFromInstanceSignInIfConnected({ params: { clusterId: CLUSTER_ID, instanceId: INSTANCE_ID } })
		).toThrow();
	});

	it('shows the form when Fabric Connect is flagged, even with a user', () => {
		setConnectedUser(INSTANCE_ID);
		authStore.flagForFabricConnect(INSTANCE_ID, true);
		expect(() =>
			redirectAwayFromInstanceSignInIfConnected({ params: { clusterId: CLUSTER_ID, instanceId: INSTANCE_ID } })
		).not.toThrow();
	});
});
