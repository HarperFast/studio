/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { post } }));

import { createOrganizationApiToken, useCreateOrganizationApiTokenMutation } from './createOrganizationApiToken';

const SECRET = 'fot_oat-abc_secret-bearer-token';
const created = {
	id: 'oat-abc',
	name: 'ci',
	organizationId: 'org-1',
	createdAt: '2026-10-06T00:00:00.000Z',
	expiresAt: '2026-11-05T00:00:00.000Z',
	lastUsedAt: null,
	token: SECRET,
};
const payload = { serviceAccountId: 'sva-1', name: 'ci', expiresInDays: 30 };

describe('createOrganizationApiToken', () => {
	beforeEach(() => {
		post.mockReset();
	});

	it('POSTs the payload to /ApiToken/', async () => {
		post.mockResolvedValue({ data: created });
		expect(await createOrganizationApiToken(payload)).toEqual(created);
		expect(post).toHaveBeenCalledWith('/ApiToken/', payload);
	});
});

describe('useCreateOrganizationApiTokenMutation cache hygiene', () => {
	beforeEach(() => {
		post.mockReset();
	});

	const withClient = (client: QueryClient) => ({ children }: { children: ReactNode }) =>
		createElement(QueryClientProvider, { client }, children);
	const cacheContainsToken = (client: QueryClient) =>
		JSON.stringify(client.getMutationCache().getAll().map((m) => m.state)).includes(SECRET);

	it('keeps the token out of the shared MutationCache (reset() clears it; gcTime:0 GCs on unmount)', async () => {
		post.mockResolvedValue({ data: created });
		const client = new QueryClient();
		const { result, unmount } = renderHook(() => useCreateOrganizationApiTokenMutation(), {
			wrapper: withClient(client),
		});

		await act(async () => {
			await result.current.mutateAsync(payload);
			result.current.reset();
		});
		await waitFor(() => expect(cacheContainsToken(client)).toBe(false));

		unmount();
		expect(client.getMutationCache().getAll()).toHaveLength(0);
	});
});
