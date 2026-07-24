/** @vitest-environment jsdom */
import { authStore } from '@/features/auth/store/authStore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let permissions = { update: false } as { update: boolean };
vi.mock('@/hooks/usePermissions', () => ({
	getOrganizationClusterPermissions: () => permissions,
	getOrganizationClusterInstancePermissions: () => permissions,
}));

const { checkClusterInstanceAuthenticationBeforeLoad } = await import('./instanceLayoutRoute');

const CLUSTER_ID = 'clu-guard';
const PARAMS = { organizationId: 'org-1', clusterId: CLUSTER_ID };
// user is null because the permission helpers are mocked and ignore it; we only need isLoading: false.
const overallAuthReady = { OverallAppSignIn: { isLoading: false, user: null } };

let establishSpy: ReturnType<typeof vi.spyOn>;
let connectionSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	permissions = { update: false };
	vi.spyOn(authStore, 'checkForFabricConnect').mockReturnValue(false);
	vi.spyOn(authStore, 'hasResolvedFabricConnect').mockReturnValue(false);
	// Default: no live connection for the entity (not signed in yet).
	connectionSpy = vi.spyOn(authStore, 'getConnectionById').mockReturnValue({ isLoading: false, user: null });
	establishSpy = vi.spyOn(authStore, 'establishFabricConnectAuth').mockResolvedValue({} as never);
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('checkClusterInstanceAuthenticationBeforeLoad', () => {
	it('re-establishes on reload (flag set, not resolved) and returns without redirecting', async () => {
		(authStore.checkForFabricConnect as ReturnType<typeof vi.fn>).mockReturnValue(true);

		await expect(
			checkClusterInstanceAuthenticationBeforeLoad({ context: { authentication: overallAuthReady }, params: PARAMS }),
		).resolves.toBeUndefined();
		expect(establishSpy).toHaveBeenCalledTimes(1);
	});

	it('does not attempt establishment twice in one pass when the reload attempt fails (manage perms)', async () => {
		// Reload: flag set + not resolved -> first attempt runs and fails; even with update permission the
		// permission-gated path must NOT fire a second mint in the same beforeLoad pass.
		(authStore.checkForFabricConnect as ReturnType<typeof vi.fn>).mockReturnValue(true);
		establishSpy.mockRejectedValue(new Error('proxy down'));
		permissions = { update: true };

		await expect(
			checkClusterInstanceAuthenticationBeforeLoad({ context: { authentication: overallAuthReady }, params: PARAMS }),
		).rejects.toMatchObject({ options: { to: expect.stringContaining('/sign-in') } });
		expect(establishSpy).toHaveBeenCalledTimes(1);
	});

	it('does not Fabric Connect over a fresh direct sign-in (reads live auth, not the stale snapshot)', async () => {
		// Simulates a just-completed direct sign-in: the live connection has a user (set synchronously by
		// the sign-in success handler) even though the router-context snapshot would still be empty, and
		// the manager has update permission. The guard must NOT auto-Fabric-Connect over the direct session.
		permissions = { update: true };
		connectionSpy.mockReturnValue({ isLoading: false, user: { username: 'direct-user' } as never });

		await expect(
			checkClusterInstanceAuthenticationBeforeLoad({
				context: { authentication: { OverallAppSignIn: { isLoading: false, user: null } } },
				params: PARAMS,
			}),
		).resolves.toBeUndefined();
		expect(establishSpy).not.toHaveBeenCalled();
	});

	it('auto-connects a first-time visitor with manage permission', async () => {
		// Not flagged yet (first visit), but the user can manage -> establish once, no redirect.
		permissions = { update: true };

		await expect(
			checkClusterInstanceAuthenticationBeforeLoad({ context: { authentication: overallAuthReady }, params: PARAMS }),
		).resolves.toBeUndefined();
		expect(establishSpy).toHaveBeenCalledTimes(1);
	});

	it('redirects to sign-in when not flagged and the user cannot manage', async () => {
		permissions = { update: false };

		await expect(
			checkClusterInstanceAuthenticationBeforeLoad({ context: { authentication: overallAuthReady }, params: PARAMS }),
		).rejects.toMatchObject({ options: { to: expect.stringContaining('/sign-in') } });
		expect(establishSpy).not.toHaveBeenCalled();
	});

	it('waits (no redirect) while the app-level sign-in is still loading', async () => {
		await expect(
			checkClusterInstanceAuthenticationBeforeLoad({
				context: { authentication: { OverallAppSignIn: { isLoading: true, user: null } } },
				params: PARAMS,
			}),
		).resolves.toBeUndefined();
		expect(establishSpy).not.toHaveBeenCalled();
	});

	it('does not redirect or crash when the app-level connection is absent from the context', async () => {
		// Regression for the RUM "Cannot read properties of undefined (reading 'user')" TypeError thrown
		// from this beforeLoad: context.authentication has no OverallAppSignIn entry, so overallAuth is
		// undefined. The guard must neither dereference overallAuth.user nor redirect from here — another
		// guard owns that redirect, and stacking redirects in one navigation can corrupt router state.
		// permissions.update is true to prove the manage path is skipped, not taken.
		permissions = { update: true };

		await expect(
			checkClusterInstanceAuthenticationBeforeLoad({ context: { authentication: {} }, params: PARAMS }),
		).resolves.toBeUndefined();
		expect(establishSpy).not.toHaveBeenCalled();
	});
});
