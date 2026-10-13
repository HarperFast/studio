/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { patch } = vi.hoisted(() => ({ patch: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { patch } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ApiTokensSetting } from './ApiTokensSetting';

beforeEach(() => {
	patch.mockImplementation((_url, { enabled }) =>
		Promise.resolve({ data: { organizationId: 'org-1', apiTokensEnabled: enabled } })
	);
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

function renderSetting(enabled: boolean) {
	const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
	client.setQueryData(['org-1'], { id: 'org-1', settings: { oauthConfigs: [], apiTokensEnabled: enabled } });
	render(
		<QueryClientProvider client={client}>
			<ApiTokensSetting organizationId="org-1" enabled={enabled} />
		</QueryClientProvider>,
	);
	return client;
}

describe('ApiTokensSetting', () => {
	it('shows API tokens off until they are turned on, and turns them on', async () => {
		renderSetting(false);
		const toggle = screen.getByRole('switch', { name: 'Allow API tokens' });
		expect(toggle.getAttribute('aria-checked')).toBe('false');
		await act(async () => {
			fireEvent.click(toggle);
		});
		expect(patch).toHaveBeenCalledWith('/Organization/org-1/settings/apiTokens', { enabled: true });
	});

	it('puts the stored value in the organization query, keeping its other settings', async () => {
		const client = renderSetting(false);
		await act(async () => {
			fireEvent.click(screen.getByRole('switch', { name: 'Allow API tokens' }));
		});
		expect(client.getQueryData(['org-1'])).toEqual({
			id: 'org-1',
			settings: { oauthConfigs: [], apiTokensEnabled: true },
		});
	});

	it('turns them off again', async () => {
		renderSetting(true);
		await act(async () => {
			fireEvent.click(screen.getByRole('switch', { name: 'Allow API tokens' }));
		});
		expect(patch).toHaveBeenCalledWith('/Organization/org-1/settings/apiTokens', { enabled: false });
	});
});
