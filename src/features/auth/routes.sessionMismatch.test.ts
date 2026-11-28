import { authRouteTree } from '@/features/auth/routes';
import { authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import type { User } from '@/integrations/api/api.patch';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The real getCurrentUser, so the store's own handling of another account's answer runs.
const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { get, post: vi.fn(), delete: vi.fn() } }));

type BeforeLoad = (load: { context: unknown; location: { search: Record<string, unknown> } }) => unknown;

const signInGuard = (authRouteTree.children as unknown as ReadonlyArray<
	{ options: { path?: string; beforeLoad?: unknown } }
>).find((child) => child.options.path === 'sign-in')?.options.beforeLoad as BeforeLoad;

afterEach(() => {
	authStore.signOutAllLocally();
	get.mockReset();
});

describe('the /sign-in guard when another tab’s account holds the session', () => {
	it('takes that account in and decides for it, falling back to its own route', async () => {
		// What /Login/ seeded this tab with, for an account another tab has since replaced.
		const previous = { id: 'usr-previous', roles: { 'org-old': {} } } as unknown as User;
		authStore.setUserForEntity(OverallAppSignIn, previous);
		const holder = {
			id: 'usr-holder',
			roles: { 'org-new': {} },
			fabricRole: 'least_privileged',
			staffPermissions: [],
		};
		get.mockResolvedValue({ data: holder });
		const context = { authentication: { [OverallAppSignIn]: { isLoading: false, user: previous } } };

		let landed: unknown;
		try {
			await signInGuard({ context, location: { search: { redirect: '/org-1/users' } } });
		} catch (thrown) {
			landed = (thrown as { options: unknown }).options;
		}

		expect(get).toHaveBeenCalledExactlyOnceWith('/User/current', { timeout: 5_000 });
		expect(authStore.getConnectionById(OverallAppSignIn).user).toEqual(holder);
		expect(landed).toEqual(expect.objectContaining({ to: '/org-new' }));
	});
});
