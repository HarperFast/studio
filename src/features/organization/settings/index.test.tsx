/**
 * @vitest-environment jsdom
 */
import type { OAuthConfig } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { get, patch } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock('@/config/apiClient', () => ({ apiClient: { get, patch } }));
vi.mock('@tanstack/react-router', () => ({ useParams: () => ({ organizationId: 'org-1' }) }));
vi.mock('@/hooks/useAuth', () => ({ useCloudAuth: () => ({ user: {} }) }));
vi.mock('@/hooks/usePermissions', () => ({ useOrganizationPermissions: () => ({ update: true }) }));
vi.mock('@/components/SubNavMenu', () => ({ SubNavMenu: () => null }));
vi.mock('@/features/organization/components/OrgPageLayout', () => ({
	OrgPageLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/features/organization/settings/ApiAccessSettings', () => ({ ApiAccessSettings: () => null }));

import { OrgSettingsIndex } from '@/features/organization/settings';

function renderSettings(oauthConfigs: OAuthConfig[]) {
	get.mockResolvedValue({ data: { id: 'org-1', settings: { oauthConfigs } } });
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<Suspense fallback={null}>
				<OrgSettingsIndex />
			</Suspense>
		</QueryClientProvider>,
	);
}

async function openEditForm() {
	fireEvent.click(await screen.findByRole('button', { name: 'Edit provider' }));
}

function sentScope(): unknown {
	return (patch.mock.calls[0][1] as Partial<OAuthConfig>).scope;
}

beforeEach(() => patch.mockResolvedValue({ data: {} }));
afterEach(() => {
	cleanup();
	vi.resetAllMocks();
});

describe('OrgSettingsIndex — OAuth scope', () => {
	it('sends the scope its placeholder shows when an added provider clears Scope to whitespace', async () => {
		renderSettings([]);
		fireEvent.click(await screen.findByRole('button', { name: 'Add OAuth provider' }));
		fireEvent.change(screen.getByLabelText('Domain'), { target: { value: 'acme.okta.com' } });
		fireEvent.change(screen.getByLabelText('Client ID'), { target: { value: 'client' } });
		fireEvent.change(screen.getByLabelText('Client Secret'), { target: { value: 'secret' } });
		const scope = screen.getByLabelText('Scope') as HTMLInputElement;
		fireEvent.change(scope, { target: { value: '  ' } });
		fireEvent.click(screen.getByRole('button', { name: 'Add Provider' }));

		await waitFor(() => expect(patch).toHaveBeenCalledOnce());
		expect(sentScope()).toBe(scope.placeholder);
		expect(sentScope()).toBe('openid email profile');
	});

	it('sends the default when an edited provider has no stored scope and Scope stays blank', async () => {
		renderSettings([{ id: 'oac-1', provider: 'okta', domain: 'acme.okta.com', clientId: '****' }]);
		await openEditForm();
		expect((screen.getByLabelText('Scope') as HTMLInputElement).value).toBe('');
		fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() => expect(patch).toHaveBeenCalledOnce());
		expect(sentScope()).toBe('openid email profile');
	});

	it('keeps a scope the admin typed', async () => {
		renderSettings([{ id: 'oac-1', provider: 'okta', domain: 'acme.okta.com', clientId: '****', scope: 'openid' }]);
		await openEditForm();
		fireEvent.change(screen.getByLabelText('Scope'), { target: { value: 'openid email groups' } });
		fireEvent.click(screen.getByRole('button', { name: 'Save' }));

		await waitFor(() => expect(patch).toHaveBeenCalledOnce());
		expect(sentScope()).toBe('openid email groups');
	});
});
