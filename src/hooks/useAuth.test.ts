/** @vitest-environment jsdom */
// jsdom: importing useAuth pulls in authStore, which touches localStorage at module load.
import type { LocalUser, User } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';
import { hasStaffPermission } from './useAuth';

const cloudUser = (fabricRole: User['fabricRole'], staffPermissions?: string[]) =>
	({ fabricRole, staffPermissions }) as User;
// A local-instance user has no fabricRole at all.
const localUser = { username: 'admin', role: { role: 'super_user' } } as unknown as LocalUser;

describe('hasStaffPermission', () => {
	it('is true exactly for the permissions the API granted', () => {
		const support = cloudUser('fabric_support', ['org:read', 'cluster:update', 'systemStatus:write']);
		expect(hasStaffPermission(support, 'org:read')).toBe(true);
		expect(hasStaffPermission(support, 'cluster:update')).toBe(true);
		expect(hasStaffPermission(support, 'org:delete')).toBe(false);
		expect(hasStaffPermission(support, 'apiToken:create')).toBe(false);
	});

	it('is false for every permission on a customer (empty staffPermissions)', () => {
		const customer = cloudUser('least_privileged', []);
		expect(hasStaffPermission(customer, 'org:read')).toBe(false);
		expect(hasStaffPermission(customer, 'org:update')).toBe(false);
	});

	// The API withheld these from fabric_admin deliberately; the UI must not
	// re-grant them by treating the role name as all-powerful.
	it('does not grant a permission the API withheld from fabric_admin', () => {
		const admin = cloudUser('fabric_admin', ['org:read', 'org:update', 'cluster:update']);
		expect(hasStaffPermission(admin, 'org:delete')).toBe(false);
		expect(hasStaffPermission(admin, 'cluster:delete')).toBe(false);
	});

	it('is false for a local-instance user and for null', () => {
		expect(hasStaffPermission(localUser, 'org:read')).toBe(false);
		expect(hasStaffPermission(null, 'org:read')).toBe(false);
	});

	describe('API predates staffPermissions (field absent)', () => {
		it('preserves the legacy behavior: fabric_admin and super_user hold everything', () => {
			expect(hasStaffPermission(cloudUser('fabric_admin'), 'org:read')).toBe(true);
			expect(hasStaffPermission(cloudUser('fabric_admin'), 'org:delete')).toBe(true);
			expect(hasStaffPermission(cloudUser('super_user'), 'systemStatus:write')).toBe(true);
		});

		it('and everyone else holds nothing', () => {
			expect(hasStaffPermission(cloudUser('least_privileged'), 'org:read')).toBe(false);
			expect(hasStaffPermission(cloudUser('fabric_readonly'), 'org:read')).toBe(false);
		});
	});
});
