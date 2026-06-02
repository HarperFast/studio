// @vitest-environment jsdom
import { authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import { describe, expect, it, vi } from 'vitest';
import { getCurrentUser } from './getCurrentUser';

vi.mock('@/config/apiClient', () => ({
	apiClient: {
		get: vi.fn().mockResolvedValue({
			data: {
				id: 'usr-test',
				email: 'admin@example.com',
				fabricRole: 'fabric_admin',
				roles: {},
			},
		}),
	},
}));

describe('getCurrentUser', () => {
	it('syncs the fetched user into the auth store', async () => {
		// The /Login/ response seeds the store with a slimmer user (no
		// fabricRole); fetching /User/current must replace it so admin-only UI
		// appears without a page refresh.
		authStore.setUserForIdAndKey(OverallAppSignIn, OverallAppSignIn, {
			id: 'usr-test',
			email: 'admin@example.com',
		} as never);
		expect(authStore.getConnectionById(OverallAppSignIn).user).not.toHaveProperty('fabricRole');

		const user = await getCurrentUser();

		expect(user.fabricRole).toBe('fabric_admin');
		expect(authStore.getConnectionById(OverallAppSignIn).user).toBe(user);
	});
});
