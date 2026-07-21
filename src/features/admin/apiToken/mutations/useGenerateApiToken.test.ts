/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { post } }));

import { generateApiToken, useGenerateApiTokenMutation } from './useGenerateApiToken';

describe('generateApiToken', () => {
	beforeEach(() => post.mockReset());

	it('POSTs to /Admin/ApiToken and returns the token result', async () => {
		post.mockResolvedValue({ data: { operationToken: 'op-tok', expiresAt: '2026-01-01T00:00:00.000Z' } });

		const result = await generateApiToken();

		expect(post).toHaveBeenCalledWith('/Admin/ApiToken', {});
		expect(result).toEqual({ operationToken: 'op-tok', expiresAt: '2026-01-01T00:00:00.000Z' });
	});
});

describe('useGenerateApiTokenMutation cache hygiene', () => {
	beforeEach(() => post.mockReset());

	const SECRET = 'secret-bearer-token';
	const withClient = (client: QueryClient) => ({ children }: { children: ReactNode }) =>
		createElement(QueryClientProvider, { client }, children);

	const cacheContainsToken = (client: QueryClient) =>
		JSON.stringify(client.getMutationCache().getAll().map((m) => m.state)).includes(SECRET);

	it('keeps the bearer token out of the shared MutationCache (reset() clears it; gcTime:0 GCs on unmount)', async () => {
		post.mockResolvedValue({ data: { operationToken: SECRET, expiresAt: '2026-01-01T00:00:00.000Z' } });
		const client = new QueryClient();
		const { result, unmount } = renderHook(() => useGenerateApiTokenMutation(), { wrapper: withClient(client) });

		// Generate, then do what the page does: copy into local state and reset().
		await act(async () => {
			await result.current.mutateAsync();
			result.current.reset();
		});

		// The credential must not remain readable via getMutationCache().
		await waitFor(() => expect(cacheContainsToken(client)).toBe(false));

		// And nothing lingers after the page unmounts (gcTime:0).
		unmount();
		expect(client.getMutationCache().getAll()).toHaveLength(0);
	});
});
