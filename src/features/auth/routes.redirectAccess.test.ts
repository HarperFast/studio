import { authRouteTree } from '@/features/auth/routes';
import { authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import type { User } from '@/integrations/api/api.patch';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUser = vi.hoisted(() => vi.fn<(options?: { timeout?: number }) => Promise<User>>());
vi.mock('@/features/auth/queries/getCurrentUser', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/features/auth/queries/getCurrentUser')>()),
	getCurrentUser,
}));

type BeforeLoad = (load: { context: unknown; location: { search: Record<string, unknown> } }) => unknown;

function beforeLoadOf(path: string): BeforeLoad {
	const route =
		(authRouteTree.children as unknown as ReadonlyArray<{ options: { path?: string; beforeLoad?: unknown } }>)
			.find((child) => child.options.path === path);
	if (!route?.options.beforeLoad) {
		throw new Error(`no beforeLoad on ${path}`);
	}
	return route.options.beforeLoad as BeforeLoad;
}

async function landing(
	path: string,
	user: User,
	redirect: string,
): Promise<{ href?: string; to?: string } | undefined> {
	const context = { authentication: { [OverallAppSignIn]: { isLoading: false, user } } };
	try {
		await beforeLoadOf(path)({ context, location: { search: { redirect } } });
		return undefined;
	} catch (thrown) {
		const { href, to } = (thrown as { options: { href?: string; to?: string } }).options;
		return { href, to };
	}
}

const customer = {
	id: 'usr-new',
	roles: {},
	fabricRole: 'least_privileged',
	staffPermissions: [],
} as unknown as User;
const staff = { ...customer, fabricRole: 'fabric_support', staffPermissions: ['org:read'] } as unknown as User;
const member = { ...customer, roles: { 'org-1': {} } } as unknown as User;
// What /Login/ seeds the store with: roles, no staff fields. A sign-in that never had to ask keeps it.
const freshFromLogin = { id: 'usr-new', roles: {} } as unknown as User;

beforeEach(() => {
	getCurrentUser.mockReset();
});

describe('a signed-in visitor’s ?redirect= on the auth pages', () => {
	it('is not followed into an organization the account can’t open', async () => {
		expect(await landing('sign-in', customer, '/org-1/users')).toEqual({ href: undefined, to: '/' });
		expect(await landing('sign-up', customer, '/org-1/users')).toBeUndefined();
		expect(getCurrentUser).not.toHaveBeenCalled();
	});

	it('is followed into a member organization', async () => {
		expect(await landing('sign-in', member, '/org-1/users')).toEqual({ href: '/org-1/users', to: undefined });
		expect(await landing('sign-up', member, '/org-1/users')).toEqual({ href: '/org-1/users', to: undefined });
		expect(getCurrentUser).not.toHaveBeenCalled();
	});

	describe('when the stored record can’t decide', () => {
		it('asks /User/current, within a short bound, and is not followed for a customer', async () => {
			getCurrentUser.mockResolvedValue(customer);
			expect(await landing('sign-in', freshFromLogin, '/org-1/users')).toEqual({ href: undefined, to: '/' });
			expect(await landing('sign-up', freshFromLogin, '/org-1/users')).toBeUndefined();
			expect(getCurrentUser).toHaveBeenCalledTimes(2);
			expect(getCurrentUser).toHaveBeenCalledWith({ timeout: 5_000 });
		});

		it('is not followed into an organization that requires single sign-on, which /Login/ can’t show', async () => {
			const memberFromLogin = { id: 'usr-new', roles: { 'org-1': {} } } as unknown as User;
			getCurrentUser.mockResolvedValue(
				{
					...customer,
					roles: { 'org-1': { oauthProviders: [{ name: 'Okta', oauthConfigId: 'oac-1' }] } },
				} as unknown as User,
			);
			expect(await landing('sign-in', memberFromLogin, '/org-1/users')).toEqual({ href: undefined, to: '/' });
		});

		it('is followed for staff who can read any organization', async () => {
			getCurrentUser.mockResolvedValue(staff);
			expect(await landing('sign-in', freshFromLogin, '/org-1/users')).toEqual({ href: '/org-1/users', to: undefined });
		});

		it('is followed when /User/current can’t be read, as sign-in is', async () => {
			getCurrentUser.mockRejectedValue(new Error('timeout of 5000ms exceeded'));
			expect(await landing('sign-in', freshFromLogin, '/org-1/users')).toEqual({ href: '/org-1/users', to: undefined });
		});

		it('sends the page nowhere when another sign-in lands during the read', async () => {
			getCurrentUser.mockImplementation(async () => {
				authStore.setUserForEntity(OverallAppSignIn, { ...customer, id: 'usr-later' } as User);
				return customer;
			});
			expect(await landing('sign-in', freshFromLogin, '/org-1/users')).toBeUndefined();
		});

		it('sends the page nowhere when the session is gone', async () => {
			getCurrentUser.mockRejectedValue({ isAxiosError: true, response: { status: 401 } });
			expect(await landing('sign-in', freshFromLogin, '/org-1/users')).toBeUndefined();
		});

		it('decides for the account that holds the session, falling back to that account’s own route', async () => {
			const oldAccount = { id: 'usr-old', roles: { 'org-old': {} } } as unknown as User;
			getCurrentUser.mockResolvedValue({ ...customer, id: 'usr-other', roles: { 'org-new': {} } } as unknown as User);
			expect(await landing('sign-in', oldAccount, '/org-1/users')).toEqual({ href: undefined, to: '/org-new' });
		});
	});
});
