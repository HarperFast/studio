import { authRouteTree } from '@/features/auth/routes';
import { OverallAppSignIn } from '@/features/auth/store/authStore';
import type { User } from '@/integrations/api/api.patch';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchCurrentUser = vi.hoisted(() => vi.fn<() => Promise<User>>());
vi.mock('@/features/auth/queries/getCurrentUser', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/features/auth/queries/getCurrentUser')>()),
	fetchCurrentUser,
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
	fetchCurrentUser.mockReset();
});

describe('a signed-in visitor’s ?redirect= on the auth pages', () => {
	it('is not followed into an organization the account can’t open', async () => {
		expect(await landing('sign-in', customer, '/org-1/users')).toEqual({ href: undefined, to: '/' });
		expect(await landing('sign-up', customer, '/org-1/users')).toBeUndefined();
		expect(fetchCurrentUser).not.toHaveBeenCalled();
	});

	it('is followed into a member organization', async () => {
		expect(await landing('sign-in', member, '/org-1/users')).toEqual({ href: '/org-1/users', to: undefined });
		expect(await landing('sign-up', member, '/org-1/users')).toEqual({ href: '/org-1/users', to: undefined });
		expect(fetchCurrentUser).not.toHaveBeenCalled();
	});

	describe('when the stored record can’t say whether staff access would open it', () => {
		it('asks /User/current, and is not followed for a customer', async () => {
			fetchCurrentUser.mockResolvedValue(customer);
			expect(await landing('sign-in', freshFromLogin, '/org-1/users')).toEqual({ href: undefined, to: '/' });
			expect(await landing('sign-up', freshFromLogin, '/org-1/users')).toBeUndefined();
			expect(fetchCurrentUser).toHaveBeenCalledTimes(2);
		});

		it('is followed for staff who can read any organization', async () => {
			fetchCurrentUser.mockResolvedValue(staff);
			expect(await landing('sign-in', freshFromLogin, '/org-1/users')).toEqual({ href: '/org-1/users', to: undefined });
		});

		it('is followed when /User/current can’t be read, as sign-in is', async () => {
			fetchCurrentUser.mockRejectedValue(new Error('offline'));
			expect(await landing('sign-in', freshFromLogin, '/org-1/users')).toEqual({ href: '/org-1/users', to: undefined });
		});

		it('is not followed once another account holds the session', async () => {
			fetchCurrentUser.mockResolvedValue({ ...staff, id: 'usr-other' } as unknown as User);
			expect(await landing('sign-in', freshFromLogin, '/org-1/users')).toEqual({ href: undefined, to: '/' });
		});
	});
});
