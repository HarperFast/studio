/** @vitest-environment jsdom */
// jsdom: importing useAuth pulls in authStore, which touches localStorage at module load.
import type { LocalUser, User } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import { isFabricAdmin } from './useAuth';

const cloudUser = (fabricRole: User['fabricRole']) => ({ fabricRole }) as User;
// A local-instance user has no fabricRole at all.
const localUser = { username: 'admin', role: { role: 'super_user' } } as unknown as LocalUser;

describe('isFabricAdmin', () => {
	// Pins the role boundary the Admin section relies on: only fabric_admin can
	// satisfy the token endpoint's SSO-session contract. super_user must NOT see
	// the section (it may password-login and would only get a 403 from the mint).
	it('is true only for a fabric_admin cloud user', () => {
		expect(isFabricAdmin(cloudUser('fabric_admin'))).toBe(true);
	});

	it('is false for super_user, least_privileged, a local user, and null', () => {
		expect(isFabricAdmin(cloudUser('super_user'))).toBe(false);
		expect(isFabricAdmin(cloudUser('least_privileged'))).toBe(false);
		expect(isFabricAdmin(localUser)).toBe(false);
		expect(isFabricAdmin(null)).toBe(false);
	});
});
