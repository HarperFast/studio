/** @vitest-environment jsdom */
import { StaffApiToken } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { get } }));
vi.mock('@/hooks/useAuth', () => ({
	useCloudAuth: () => ({
		isLoading: false,
		user: { id: 'usr-me', email: 'me@harperdb.io', firstname: 'Me', lastname: 'Myself', fabricRole: 'fabric_readonly' },
	}),
	useStaffPermission: () => false,
}));

import { ApiTokenIndex, matchesTokenFilter } from './index';

const token = (id: string, name: string, ownerUserId = 'usr-me'): StaffApiToken => ({
	id,
	name,
	role: 'fabric_readonly',
	ownerUserId,
	createdByUserId: 'usr-admin',
	createdAt: '2026-10-21T00:00:00.000Z',
	expiresAt: '2026-11-04T00:00:00.000Z',
	lastUsedAt: null,
	revokedAt: null,
	status: 'active',
});
const admin = { id: 'usr-admin', email: 'admin@harperdb.io', firstname: 'Ada', lastname: 'Min', status: 'ACTIVE' };

function renderPage(client: QueryClient) {
	return render(
		<QueryClientProvider client={client}>
			<ApiTokenIndex />
		</QueryClientProvider>,
	);
}

beforeEach(() => get.mockReset());
afterEach(cleanup);

describe('ApiTokenIndex', () => {
	// A background refresh that fails must not take the last known rows, and their revoke
	// controls, off the page.
	it('keeps the cached tokens and offers a retry when a refresh fails', async () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		client.setQueryData(['fabric-admin', 'apiTokens'], [token('sat-amxihhzaylk5mtrf', 'nightly')]);
		get.mockImplementation((url?: string) =>
			url?.startsWith('/Admin/ApiToken')
				? Promise.reject(new Error('502'))
				: Promise.resolve({ data: admin })
		);

		renderPage(client);

		expect(await screen.findByText(/Couldn't refresh the list/)).toBeDefined();
		expect(screen.getByText('nightly')).toBeDefined();
		expect(screen.getByRole('button', { name: 'Actions for nightly' })).toBeDefined();

		get.mockImplementation(() =>
			Promise.resolve({ data: [token('sat-amxihhzaylk5mtrf', 'nightly'), token('sat-2', 'second')] })
		);
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
		});

		expect(await screen.findByText('second')).toBeDefined();
		expect(screen.queryByText(/Couldn't refresh the list/)).toBeNull();
	});

	it('filters by the owner address and the masked id the rows show', async () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		client.setQueryData(['fabric-admin', 'apiTokens'], [
			token('sat-amxihhzaylk5mtrf', 'nightly'),
			token('sat-zzzzzzzzzzzzzzzz', 'other', 'usr-admin'),
		]);
		get.mockImplementation((url?: string) =>
			url?.startsWith('/Admin/ApiToken')
				? Promise.resolve({ data: client.getQueryData(['fabric-admin', 'apiTokens']) })
				: Promise.resolve({ data: admin })
		);
		renderPage(client);
		// The minter's address arrives from its lookup; wait for it before filtering on addresses.
		await screen.findAllByText('admin@harperdb.io');

		// Both tokens were minted by the admin, so only the owner address separates them.
		fireEvent.change(screen.getByLabelText('Filter tokens'), { target: { value: 'me@harperdb' } });
		expect(screen.getByText('nightly')).toBeDefined();
		expect(screen.queryByText('other')).toBeNull();

		fireEvent.change(screen.getByLabelText('Filter tokens'), { target: { value: 'admin@harperdb' } });
		expect(screen.getByText('nightly')).toBeDefined();
		expect(screen.getByText('other')).toBeDefined();

		fireEvent.change(screen.getByLabelText('Filter tokens'), { target: { value: 'sat-amxi…mtrf' } });
		expect(screen.getByText('nightly')).toBeDefined();
		expect(screen.queryByText('other')).toBeNull();
	});
});

describe('matchesTokenFilter', () => {
	const text = (id: string) => (id === 'usr-me' ? 'me@harperdb.io Me Myself' : '');

	it('matches the name, role, status, both ids and their masks, and the resolved user text', () => {
		const t = token('sat-amxihhzaylk5mtrf', 'nightly');
		expect(matchesTokenFilter(t, 'NIGHT', text)).toBe(true);
		expect(matchesTokenFilter(t, 'readonly', text)).toBe(true);
		expect(matchesTokenFilter(t, 'active', text)).toBe(true);
		expect(matchesTokenFilter(t, 'sat-amxi…mtrf', text)).toBe(true);
		expect(matchesTokenFilter(t, 'zaylk5', text)).toBe(true);
		expect(matchesTokenFilter(t, 'myself', text)).toBe(true);
		expect(matchesTokenFilter(t, 'usr-admin', text)).toBe(true);
		expect(matchesTokenFilter(t, 'nothing here', text)).toBe(false);
		expect(matchesTokenFilter(t, '   ', text)).toBe(true);
	});
});
