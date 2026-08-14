/** @vitest-environment jsdom */
// jsdom: AdminShell imports useAuth, whose authStore touches localStorage at module load.
import { canSeeAdminSection, visibleAdminItems } from '@/features/admin/components/AdminShell';
import type { User } from '@/integrations/api/api.patch';
import { describe, expect, it } from 'vitest';

const user = (fabricRole: User['fabricRole'], staffPermissions?: string[]) =>
	({ fabricRole, staffPermissions }) as User;

const labels = (u: User | null) => visibleAdminItems(u).map((item) => item.label);

describe('admin section visibility', () => {
	it('shows every page to a holder of all three page permissions', () => {
		const admin = user('fabric_admin', ['systemStatus:write', 'region:read', 'apiToken:create']);
		expect(labels(admin)).toEqual(['Notifications', 'Regions', 'API Token']);
	});

	it('shows only the pages a narrower role holds', () => {
		expect(labels(user('fabric_support', ['systemStatus:write', 'region:read']))).toEqual([
			'Notifications',
			'Regions',
		]);
		expect(labels(user('fabric_readonly', ['region:read']))).toEqual(['Regions']);
	});

	it('hides the section entirely from customers', () => {
		expect(canSeeAdminSection(user('least_privileged', []))).toBe(false);
		expect(canSeeAdminSection(null)).toBe(false);
	});

	// super_user may password-login; without a Google SSO session the token mint
	// 403s, so the API Token page stays hidden even though it holds the permission.
	it('never shows the API Token page to super_user', () => {
		const withField = user('super_user', ['systemStatus:write', 'region:read', 'apiToken:create']);
		expect(labels(withField)).toEqual(['Notifications', 'Regions']);
		// Legacy API without staffPermissions: same carve-out via the fallback.
		expect(labels(user('super_user'))).toEqual(['Notifications', 'Regions']);
	});

	it('keeps the whole section for a legacy-API fabric_admin', () => {
		expect(labels(user('fabric_admin'))).toEqual(['Notifications', 'Regions', 'API Token']);
	});
});
