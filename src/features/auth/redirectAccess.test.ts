import type { LocalUser, User } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import { redirectAccess } from './redirectAccess';

const app = (to: string) => ({ kind: 'app', to }) as const;
// What /Login/ answers: roles, but no staff fields.
const signedIn = { id: 'usr-ada', roles: { 'org-mine': {} } } as unknown as User;
// What /User/current answers for a customer.
const customer = { ...signedIn, fabricRole: 'least_privileged', staffPermissions: [] } as unknown as User;
const staff = { ...signedIn, fabricRole: 'fabric_support', staffPermissions: ['org:read'] } as unknown as User;

describe('redirectAccess', () => {
	it.each([
		['the MCP authorization', { kind: 'server', href: '/oauth/mcp/authorize?state=s' } as const],
		['a route outside any organization', app('/profile')],
		['an organization the account belongs to', app('/org-mine/clu-1/usage')],
		['a member organization, with a query', app('/org-mine?tab=users')],
		['a first segment that only looks like an id', app('/org-Theirs/users')],
	])('follows %s', (_case, target) => {
		expect(redirectAccess(customer, target)).toBe('open');
	});

	it('keeps an account out of an organization it does not belong to', () => {
		expect(redirectAccess(customer, app('/org-theirs/users'))).toBe('closed');
		expect(redirectAccess(customer, app('/org-theirs'))).toBe('closed');
		expect(redirectAccess(customer, app('/org-theirs?tab=users'))).toBe('closed');
	});

	it('keeps a member out of an organization that needs its own provider sign-in first', () => {
		const locked = {
			...customer,
			roles: { 'org-sso': { oauthProviders: [{ name: 'Okta', oauthConfigId: 'oac-1' }] } },
		} as unknown as User;
		expect(redirectAccess(locked, app('/org-sso/clusters'))).toBe('closed');
		expect(redirectAccess({ ...locked, staffPermissions: ['org:read'] } as User, app('/org-sso/clusters'))).toBe(
			'open',
		);
		const lockedFromLogin = { id: 'usr-ada', roles: locked.roles } as unknown as User;
		expect(redirectAccess(lockedFromLogin, app('/org-sso/clusters'))).toBe('unknown');
	});

	it('reads a percent-encoded organization segment as the router does', () => {
		expect(redirectAccess(customer, app('/org%2Dtheirs/users'))).toBe('closed');
		expect(redirectAccess(customer, app('/%E0%A4%A/users'))).toBe('open');
	});

	it('lets staff with org:read into any organization', () => {
		expect(redirectAccess(staff, app('/org-theirs/users'))).toBe('open');
	});

	it('falls back to staff role names on an API that predates staffPermissions', () => {
		const admin = { ...signedIn, fabricRole: 'fabric_admin' } as unknown as User;
		expect(redirectAccess(admin, app('/org-theirs/users'))).toBe('open');
	});

	it('cannot tell from a /Login/ record whether staff access would open it', () => {
		expect(redirectAccess(signedIn, app('/org-theirs/users'))).toBe('unknown');
		expect(redirectAccess(signedIn, app('/org-mine/users'))).toBe('open');
	});

	it('follows anything for a local instance’s user', () => {
		const local = { username: 'admin' } as unknown as LocalUser;
		expect(redirectAccess(local, app('/org-theirs/users'))).toBe('open');
	});
});
