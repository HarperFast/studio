import { beforeEach, describe, expect, it, vi } from 'vitest';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { get } }));

import { getStaffApiTokens, getStaffApiTokensQueryOptions, staffApiTokensQueryKey } from './getStaffApiTokens';

describe('getStaffApiTokens', () => {
	beforeEach(() => get.mockReset());

	it('lists every token the caller may see from the collection path', async () => {
		get.mockResolvedValue({ data: [{ id: 'sat-1' }] });

		expect(await getStaffApiTokens()).toEqual([{ id: 'sat-1' }]);
		// Without the trailing slash Harper returns the collection descriptor, not the rows.
		expect(get).toHaveBeenCalledWith('/Admin/ApiToken/');
	});

	it('scopes to an owner through the query string, encoded', async () => {
		get.mockResolvedValue({ data: [] });

		await getStaffApiTokens('usr/odd id');

		expect(get).toHaveBeenCalledWith('/Admin/ApiToken/?ownerUserId=usr%2Fodd%20id');
	});

	it('keys every scope under one prefix so a mint or revoke can refresh them all', () => {
		expect(getStaffApiTokensQueryOptions().queryKey).toEqual([...staffApiTokensQueryKey, 'all']);
		expect(getStaffApiTokensQueryOptions('usr-1').queryKey).toEqual([...staffApiTokensQueryKey, 'usr-1']);
	});
});
