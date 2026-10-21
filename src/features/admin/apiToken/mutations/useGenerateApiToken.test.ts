/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { post } }));

import { staffApiTokensQueryKey } from '../queries/getStaffApiTokens';
import { generateApiToken, useGenerateApiTokenMutation } from './useGenerateApiToken';

const SECRET = 'fat_sat-abc_secret-bearer-token';
const minted = {
	operationToken: SECRET,
	id: 'sat-abc',
	name: 'nightly report',
	role: 'fabric_readonly',
	ownerUserId: 'usr-1',
	createdByUserId: 'usr-admin',
	createdAt: '2026-10-21T00:00:00.000Z',
	expiresAt: '2026-11-04T00:00:00.000Z',
	lastUsedAt: null,
	revokedAt: null,
	status: 'active',
};
const payload = { ownerUserId: 'usr-1', role: 'fabric_readonly', name: 'nightly report', expiresInHours: 336 } as const;

describe('generateApiToken', () => {
	beforeEach(() => post.mockReset());

	it('POSTs the mint request to /Admin/ApiToken/ and returns the token with its secret', async () => {
		post.mockResolvedValue({ data: minted });

		expect(await generateApiToken(payload)).toEqual(minted);
		expect(post).toHaveBeenCalledWith('/Admin/ApiToken/', payload);
	});

	it('sends an empty body by default, which mints the caller a token at their own role', async () => {
		post.mockResolvedValue({ data: minted });

		await generateApiToken();

		expect(post).toHaveBeenCalledWith('/Admin/ApiToken/', {});
	});
});

describe('useGenerateApiTokenMutation', () => {
	beforeEach(() => post.mockReset());

	const withClient = (client: QueryClient) => ({ children }: { children: ReactNode }) =>
		createElement(QueryClientProvider, { client }, children);

	const cacheContainsToken = (client: QueryClient) =>
		JSON.stringify(client.getMutationCache().getAll().map((m) => m.state)).includes(SECRET);

	it('keeps the bearer token out of the shared MutationCache (reset() clears it; gcTime:0 GCs on unmount)', async () => {
		post.mockResolvedValue({ data: minted });
		const client = new QueryClient();
		const { result, unmount } = renderHook(() => useGenerateApiTokenMutation(), { wrapper: withClient(client) });

		// Mint, then do what the form does: copy into local state and reset().
		await act(async () => {
			await result.current.mutateAsync(payload);
			result.current.reset();
		});

		// The credential must not remain readable via getMutationCache().
		await waitFor(() => expect(cacheContainsToken(client)).toBe(false));

		// And nothing lingers after the page unmounts (gcTime:0).
		unmount();
		expect(client.getMutationCache().getAll()).toHaveLength(0);
	});

	it('refreshes every token list once the mint lands', async () => {
		post.mockResolvedValue({ data: minted });
		const client = new QueryClient();
		const invalidate = vi.spyOn(client, 'invalidateQueries');
		const { result } = renderHook(() => useGenerateApiTokenMutation(), { wrapper: withClient(client) });

		await act(async () => {
			await result.current.mutateAsync(payload);
		});

		expect(invalidate).toHaveBeenCalledWith({ queryKey: staffApiTokensQueryKey });
	});
});
