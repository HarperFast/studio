import { authRouteTree } from '@/features/auth/routes';
import { OverallAppSignIn } from '@/features/auth/store/authStore';
import type { User } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';

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

/** Where a guard sent a signed-in visitor, or undefined when it let the page render. */
function landing(path: string, user: User, redirect: string): { href?: string; to?: string } | undefined {
	const context = { authentication: { [OverallAppSignIn]: { isLoading: false, user } } };
	try {
		beforeLoadOf(path)({ context, location: { search: { redirect } } });
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
const member = { ...customer, roles: { 'org-1': {} } } as unknown as User;
// What /Login/ seeds the store with: roles, no staff fields.
const freshFromLogin = { id: 'usr-new', roles: {} } as unknown as User;

describe('a signed-in visitor’s ?redirect= on the auth pages', () => {
	it('is not followed into an organization the account can’t open', () => {
		expect(landing('sign-in', customer, '/org-1/users')).toEqual({ href: undefined, to: '/' });
		// Sign-up shows its form to a signed-in visitor with nothing to continue to.
		expect(landing('sign-up', customer, '/org-1/users')).toBeUndefined();
	});

	it('is followed into a member organization', () => {
		expect(landing('sign-in', member, '/org-1/users')).toEqual({ href: '/org-1/users', to: undefined });
		expect(landing('sign-up', member, '/org-1/users')).toEqual({ href: '/org-1/users', to: undefined });
	});

	it('is followed when the account record can’t say whether staff access would open it', () => {
		expect(landing('sign-in', freshFromLogin, '/org-1/users')).toEqual({ href: '/org-1/users', to: undefined });
	});
});
