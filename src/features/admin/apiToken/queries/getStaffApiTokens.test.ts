import { beforeEach, describe, expect, it, vi } from 'vitest';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { get } }));

import { getStaffApiTokens } from './getStaffApiTokens';

describe('getStaffApiTokens', () => {
	beforeEach(() => get.mockReset());

	it('lists every token the caller may see from the collection path', async () => {
		get.mockResolvedValue({ data: [{ id: 'sat-1' }] });

		expect(await getStaffApiTokens()).toEqual([{ id: 'sat-1' }]);
		expect(get).toHaveBeenCalledWith('/Admin/ApiToken/');
	});
});
