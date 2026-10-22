/** @vitest-environment jsdom */
// jsdom: AdminShell imports useAuth, whose authStore touches localStorage at module load.
import { canSeeAdminSection, visibleAdminItems } from '@/features/admin/components/AdminShell';
import type { User } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';

const user = (fabricRole: User['fabricRole'], staffPermissions?: string[]) =>
	({ fabricRole, staffPermissions }) as User;

const labels = (u: User | null) => visibleAdminItems(u).map((item) => item.label);

describe('admin section visibility', () => {
	it('shows every page to a holder of all four page permissions', () => {
		const admin = user('fabric_admin', ['systemStatus:write', 'region:read', 'host:read', 'apiToken:create']);
		expect(labels(admin)).toEqual(['Notifications', 'Regions', 'Hosts', 'API Token']);
	});

	it('shows only the pages a narrower role holds', () => {
		expect(labels(user('fabric_support', ['systemStatus:write', 'region:read']))).toEqual([
			'Notifications',
			'Regions',
		]);
		expect(labels(user('fabric_readonly', ['region:read']))).toEqual(['Regions']);
		expect(labels(user('fabric_readonly', ['region:read', 'host:read']))).toEqual(['Regions', 'Hosts']);
	});

	// Reading the policy is cluster:read, which every staff role holds; changing it is gated inside the page.
	it('shows Monitoring to every role that can read clusters', () => {
		expect(labels(user('fabric_readonly', ['cluster:read', 'region:read']))).toEqual(['Regions', 'Monitoring']);
		expect(labels(user('fabric_staff', ['cluster:read', 'monitoringPolicy:write']))).toEqual(['Monitoring']);
	});

	it('hides the section entirely from customers', () => {
		expect(canSeeAdminSection(user('least_privileged', []))).toBe(false);
		expect(canSeeAdminSection(null)).toBe(false);
	});

	// super_user may password-login; without a Google SSO session the token mint
	// 403s, so the API Token page stays hidden even though it holds the permission.
	it('never shows the API Token page to super_user', () => {
		const withField = user('super_user', ['systemStatus:write', 'region:read', 'host:read', 'apiToken:create']);
		expect(labels(withField)).toEqual(['Notifications', 'Regions', 'Hosts']);
		// Legacy API without staffPermissions: same carve-out via the fallback.
		expect(labels(user('super_user'))).toEqual(['Notifications', 'Regions', 'Hosts', 'Monitoring', 'Users']);
	});

	it('keeps the whole section for a legacy-API fabric_admin', () => {
		expect(labels(user('fabric_admin'))).toEqual([
			'Notifications',
			'Regions',
			'Hosts',
			'Monitoring',
			'Users',
			'API Token',
		]);
	});

	it('shows Users only to holders of user:status, not to every role that can read users', () => {
		expect(labels(user('fabric_admin', ['user:read', 'user:status']))).toEqual(['Users']);
		expect(labels(user('fabric_readonly', ['user:read']))).toEqual([]);
	});
});
