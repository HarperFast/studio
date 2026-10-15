// @vitest-environment jsdom
import { authStore, OverallAppSignIn } from '@/features/auth/store/authStore';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentUser } from './getCurrentUser';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { get } }));

const current = { id: 'usr-test', email: 'admin@example.com', fabricRole: 'fabric_admin', roles: {} };

function signIn(user: object) {
	authStore.setUserForIdAndKey(OverallAppSignIn, OverallAppSignIn, user as never);
}

beforeEach(() => {
	get.mockResolvedValue({ data: current });
});

describe('getCurrentUser', () => {
	it('syncs the fetched user into the auth store', async () => {
		// The /Login/ response seeds the store with a slimmer user (no
		// fabricRole); fetching /User/current must replace it so admin-only UI
		// appears without a page refresh.
		signIn({ id: 'usr-test', email: 'admin@example.com' });
		expect(authStore.getConnectionById(OverallAppSignIn).user).not.toHaveProperty('fabricRole');

		const user = await getCurrentUser();

		expect(user.fabricRole).toBe('fabric_admin');
		expect(authStore.getConnectionById(OverallAppSignIn).user).toBe(user);
	});

	it('leaves a sign-in made while it was in flight, whose session its answer may predate', async () => {
		signIn({ id: 'usr-test' });
		let answer: (response: unknown) => void = () => undefined;
		get.mockReturnValue(
			new Promise((resolve) => {
				answer = resolve;
			}),
		);
		const fetched = getCurrentUser();

		signIn({ id: 'usr-other' });
		answer({ data: current });
		await fetched;

		expect(authStore.getConnectionById(OverallAppSignIn).user).toEqual({ id: 'usr-other' });
	});
});
