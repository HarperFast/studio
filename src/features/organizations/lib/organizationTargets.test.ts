/** @vitest-environment jsdom */
import type { LocalUser, User } from '@/integrations/api/api.patch';
import { getDefaultSignedInCloudRouteForUser } from '@/lib/urls/getDefaultSignedInCloudRouteForUser';
import { describe, expect, it } from 'vitest';
import { getOrganizationTargets } from './organizationTargets';

const user = (roles: User['roles'], overrides: Partial<User> = {}): User => ({
	id: 'user-a',
	oauthConfigId: null,
	firstname: 'Alex',
	lastname: 'User',
	email: 'alex@example.test',
	fabricRole: 'least_privileged',
	roles,
	...overrides,
});
const role = (
	organizationName: string,
) => ({ id: 'role-a', role: 'developer', organizationName } as User['roles'][string]);

describe('organization navigation targets', () => {
	it('handles no session, local sessions, and no memberships', () => {
		expect(getOrganizationTargets(null)).toEqual([]);
		expect(getOrganizationTargets({ username: 'admin' } as LocalUser)).toEqual([]);
		expect(getOrganizationTargets(user({}))).toEqual([]);
	});
	it('sorts by display name with an ID fallback and preserves locked organizations', () => {
		const targets = getOrganizationTargets(user({
			'org-z': role('Zulu'),
			'org-a': { ...role('Alpha'), oauthProviders: [{ name: 'SSO', oauthConfigId: 'oauth-a' }] },
			'org-b': role(''),
		}));
		expect(targets.map(target => [target.id, target.name, target.locked])).toEqual([
			['org-a', 'Alpha', true],
			['org-b', 'org-b', false],
			['org-z', 'Zulu', false],
		]);
		expect(targets[0].providers[0].oauthConfigId).toBe('oauth-a');
	});
	it('respects explicit staff grants and their legacy fallback for OAuth requirements', () => {
		const roles = { 'org-a': { ...role('Alpha'), oauthProviders: [] } };
		expect(getOrganizationTargets(user(roles, { fabricRole: 'fabric_admin' }))[0].locked).toBe(false);
		expect(getOrganizationTargets(user(roles, { fabricRole: 'fabric_admin', staffPermissions: [] }))[0].locked).toBe(
			true,
		);
		expect(getOrganizationTargets(user(roles, { staffPermissions: ['org:read'] }))[0].locked).toBe(false);
	});
	it('lands only a single enterable membership directly in its organization', () => {
		expect(getDefaultSignedInCloudRouteForUser(user({ 'org-a': role('Alpha') }))).toBe('/org-a');
		expect(getDefaultSignedInCloudRouteForUser(user({ 'org-a': { ...role('Alpha'), oauthProviders: [] } }))).toBe('/');
		expect(getDefaultSignedInCloudRouteForUser(user({ 'org-a': role('Alpha'), 'org-b': role('Beta') }))).toBe('/');
	});
});
