/** @vitest-environment jsdom */
import { StaffApiToken } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { createElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { del } = vi.hoisted(() => ({ del: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { delete: del } }));

import { getStaffApiTokensQueryOptions, staffApiTokensQueryKey } from '../queries/getStaffApiTokens';
import { revokeApiToken, useRevokeApiTokenMutation } from './useRevokeApiToken';

const token = (id: string): StaffApiToken => ({
	id,
	name: id,
	role: 'fabric_readonly',
	ownerUserId: 'usr-1',
	createdByUserId: 'usr-admin',
	createdAt: '2026-10-21T00:00:00.000Z',
	expiresAt: '2026-11-04T00:00:00.000Z',
	lastUsedAt: null,
	revokedAt: null,
	status: 'active',
});

describe('revokeApiToken', () => {
	beforeEach(() => del.mockReset());

	it('DELETEs /Admin/ApiToken/:id with the id encoded', async () => {
		del.mockResolvedValue({ data: { id: 'sat/1', revoked: true } });

		expect(await revokeApiToken('sat/1')).toEqual({ id: 'sat/1', revoked: true });
		expect(del).toHaveBeenCalledWith('/Admin/ApiToken/sat%2F1');
	});
});

describe('useRevokeApiTokenMutation', () => {
	beforeEach(() => del.mockReset());

	const withClient = (client: QueryClient) => ({ children }: { children: ReactNode }) =>
		createElement(QueryClientProvider, { client }, children);

	// A revoked token stays listed with its status, so the cache marks it rather than dropping it,
	// before the refetch answers.
	it('marks the token revoked in the cached list at once, then refreshes it', async () => {
		del.mockResolvedValue({ data: { id: 'sat-2', revoked: true } });
		const client = new QueryClient();
		client.setQueryData(getStaffApiTokensQueryOptions().queryKey, [token('sat-1'), token('sat-2')]);
		const invalidate = vi.spyOn(client, 'invalidateQueries');
		const { result } = renderHook(() => useRevokeApiTokenMutation(), { wrapper: withClient(client) });

		await act(async () => {
			await result.current.mutateAsync('sat-2');
		});

		const all = client.getQueryData<StaffApiToken[]>(getStaffApiTokensQueryOptions().queryKey)!;
		expect(all.map((t) => t.status)).toEqual(['active', 'revoked']);
		expect(all[1].revokedAt).toEqual(expect.any(String));
		expect(invalidate).toHaveBeenCalledWith({ queryKey: staffApiTokensQueryKey });
	});
});
