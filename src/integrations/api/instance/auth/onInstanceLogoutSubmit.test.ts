/** @vitest-environment jsdom */
import { authStore } from '@/features/auth/store/authStore';
import type { AxiosInstance } from 'axios';
import { afterEach, expect, it, vi } from 'vitest';
import { onInstanceLogoutSubmit } from './onInstanceLogoutSubmit';

afterEach(() => {
	vi.restoreAllMocks();
});

it('clears Fabric Connect (in-memory token + flag) and basic auth on logout', async () => {
	const fabricSpy = vi.spyOn(authStore, 'flagForFabricConnect');
	const basicSpy = vi.spyOn(authStore, 'flagForBasicAuth');
	const instanceClient = {
		post: vi.fn().mockResolvedValue({ data: { message: 'Logout successful' } }),
	} as unknown as AxiosInstance;

	const result = await onInstanceLogoutSubmit({ instanceClient, entityId: 'ins-logout' });

	expect(result).toEqual({ message: 'Logout successful' });
	// flagForFabricConnect(id, false) is what drops the in-memory JWT (fabricConnectAuth.delete).
	expect(fabricSpy).toHaveBeenCalledWith('ins-logout', false);
	expect(basicSpy).toHaveBeenCalledWith('ins-logout', null);
});
