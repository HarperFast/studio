/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectStub } from './selectStub';

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

const { get, patch, del, accounts, created } = vi.hoisted(() => ({
	get: vi.fn(),
	patch: vi.fn(),
	del: vi.fn(),
	accounts: { value: [] as Array<Record<string, unknown>> },
	created: { value: null as null | Record<string, unknown> },
}));
vi.mock('@/config/apiClient', () => ({ apiClient: { get, patch, delete: del } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), loading: vi.fn() } }));
vi.mock('@/components/ui/select', () => selectStub);
// Radix opens its menu on pointer events jsdom doesn't produce; a flat stand-in keeps the items reachable.
vi.mock('@/components/ui/dropdownMenu', () => ({
	DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
	DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	DropdownMenuItem: (
		{ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean },
	) => <button type="button" role="menuitem" onClick={onClick} disabled={disabled}>{children}</button>,
}));
vi.mock('@/features/organization/serviceAccounts/modals/CreateServiceAccountModal', () => ({
	CreateServiceAccountModal: ({ onCreated }: { onCreated: (account: Record<string, unknown>) => void }) => (
		<button
			type="button"
			onClick={() => onCreated(created.value!)}
		>
			finish creating
		</button>
	),
}));
vi.mock('@/features/organization/serviceAccounts/modals/CreateApiTokenModal', () => ({
	CreateApiTokenModal: ({ serviceAccountId }: { serviceAccountId: string }) => (
		<div>create token dialog for {serviceAccountId}</div>
	),
}));

import { ServiceAccountsSection } from '../ServiceAccountsSection';

const account = (overrides: Record<string, unknown> = {}) => ({
	id: 'sva-ci',
	organizationId: 'org-1',
	name: 'github-actions',
	roleId: 'rol-ci',
	roleName: 'ci-preview',
	status: 'ACTIVE',
	createdAt: '2026-10-01T12:00:00.000Z',
	createdByUserId: 'usr-admin',
	activeTokens: 2,
	...overrides,
});
const tokens = [
	{
		id: 'oat-live',
		name: 'deploy',
		serviceAccountId: 'sva-ci',
		organizationId: 'org-1',
		createdAt: iso(-DAY_MS),
		expiresAt: iso(29 * DAY_MS + 60 * 1000),
		lastUsedAt: null,
		createdByUserId: 'usr-admin',
		createdByEmail: 'admin@example.com',
	},
	{
		id: 'oat-old',
		name: 'nightly',
		serviceAccountId: 'sva-ci',
		organizationId: 'org-1',
		createdAt: iso(-40 * DAY_MS),
		expiresAt: iso(-3 * DAY_MS),
		lastUsedAt: iso(-5 * DAY_MS),
		createdByUserId: 'usr-gone',
		createdByEmail: null,
	},
];
const roles = [
	{ id: 'rol-ci', roleName: 'ci-preview', organizationId: 'org-1' },
	{ id: 'rol-deploy', roleName: 'deployer', organizationId: 'org-1' },
];

beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

beforeEach(() => {
	accounts.value = [account(), account({ id: 'sva-old', name: 'retired-bot', roleName: null, status: 'DISABLED' })];
	get.mockImplementation(async (url: string) => {
		if (url === '/ServiceAccount/') { return { data: accounts.value }; }
		if (url === '/ApiToken/') { return { data: tokens }; }
		if (url.startsWith('/OrganizationRole/')) { return { data: roles }; }
		throw new Error(`unexpected GET ${url}`);
	});
	patch.mockImplementation(async (url: string, body: object) => ({
		data: { ...accounts.value.find((a) => url.endsWith(String(a.id))), ...body },
	}));
	del.mockResolvedValue({ data: { deleted: true } });
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

function renderSection() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	render(
		<QueryClientProvider client={queryClient}>
			<ServiceAccountsSection organizationId="org-1" />
		</QueryClientProvider>,
	);
	return queryClient;
}

const accountButton = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) });

async function select(name: string) {
	await screen.findByText(name);
	await act(async () => {
		fireEvent.click(accountButton(name));
	});
	return screen.findByRole('region', { name: `API tokens of ${name}` });
}

describe('ServiceAccountsSection', () => {
	it('lists each account with its id, role, status and live token count', async () => {
		renderSection();
		const row = (await screen.findByText('github-actions')).closest('tr')!;
		expect(within(row).getByText('sva-ci')).toBeTruthy();
		expect(within(row).getByText('ci-preview')).toBeTruthy();
		expect(within(row).getByText('Enabled')).toBeTruthy();
		expect(within(row).getByText('2')).toBeTruthy();
		const retired = screen.getByText('retired-bot').closest('tr')!;
		expect(within(retired).getByText('Role deleted')).toBeTruthy();
		expect(within(retired).getByText('Disabled')).toBeTruthy();
		expect(get).toHaveBeenCalledWith('/ServiceAccount/', { params: { organizationId: 'org-1' } });
	});

	it('shows nothing selected until an account is chosen, then its tokens beneath the list; choosing it again hides them', async () => {
		renderSection();
		await screen.findByText('github-actions');
		expect(screen.queryByRole('region')).toBeNull();
		await select('github-actions');
		expect(accountButton('github-actions').getAttribute('aria-expanded')).toBe('true');
		expect(accountButton('github-actions').closest('tr')!.getAttribute('data-state')).toBe('selected');
		expect(get).toHaveBeenCalledWith('/ApiToken/', { params: { organizationId: 'org-1', serviceAccountId: 'sva-ci' } });
		await act(async () => {
			fireEvent.click(accountButton('github-actions'));
		});
		expect(screen.queryByRole('region')).toBeNull();
	});

	it('shows readable token times and who created each token', async () => {
		renderSection();
		const panel = await select('github-actions');
		const live = (await within(panel).findByText('deploy')).closest('tr')!;
		const creator = within(live).getByText('admin@example.com');
		expect(within(live).queryByText('usr-admin')).toBeNull();
		await act(async () => {
			fireEvent.focus(creator);
		});
		expect((await screen.findAllByText('usr-admin')).length).toBeGreaterThan(0);
		expect(within(live).getByText('In 29 days')).toBeTruthy();
		expect(within(live).getByText('Not used yet')).toBeTruthy();
		const old = within(panel).getByText('nightly').closest('tr')!;
		expect(within(old).getByText('usr-gone')).toBeTruthy();
		expect(within(old).getByText(/^Expired/)).toBeTruthy();
		expect(within(old).getByText('5 days ago')).toBeTruthy();
	});

	it('changes an account’s role from its row menu, saving only a different role', async () => {
		renderSection();
		const row = (await screen.findByText('github-actions')).closest('tr')!;
		expect(within(row).queryByLabelText('Role')).toBeNull();
		await act(async () => {
			fireEvent.click(within(row).getByRole('menuitem', { name: /Change role/ }));
		});
		const dialog = await screen.findByRole('dialog', { name: 'Change role' });
		const save = within(dialog).getByRole('button', { name: 'Save' }) as HTMLButtonElement;
		expect(save.disabled).toBe(true);
		await waitFor(() => expect(within(dialog).getByRole('option', { name: /deployer/ })).toBeTruthy());
		await act(async () => {
			fireEvent.change(within(dialog).getByLabelText('Role'), { target: { value: 'rol-deploy' } });
		});
		expect(save.disabled).toBe(false);
		await act(async () => {
			fireEvent.click(save);
		});
		expect(patch).toHaveBeenCalledWith('/ServiceAccount/sva-ci', { roleId: 'rol-deploy' });
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	});

	it('leaves the role alone when the dialog is cancelled, and keeps the role out of the token panel', async () => {
		renderSection();
		const panel = await select('github-actions');
		expect(within(panel).queryByLabelText('Role')).toBeNull();
		const row = accountButton('github-actions').closest('tr')!;
		await act(async () => {
			fireEvent.click(within(row).getByRole('menuitem', { name: /Change role/ }));
		});
		const dialog = await screen.findByRole('dialog', { name: 'Change role' });
		await act(async () => {
			fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
		});
		expect(patch).not.toHaveBeenCalled();
		expect(screen.getByRole('region', { name: 'API tokens of github-actions' })).toBeTruthy();
	});

	it('disables an account from its row, and offers to enable a disabled one', async () => {
		renderSection();
		const row = (await screen.findByText('github-actions')).closest('tr')!;
		await act(async () => {
			fireEvent.click(within(row).getByRole('menuitem', { name: /Disable/ }));
		});
		expect(patch).toHaveBeenCalledWith('/ServiceAccount/sva-ci', { status: 'DISABLED' });
		const retired = screen.getByText('retired-bot').closest('tr')!;
		expect(within(retired).getByRole('menuitem', { name: /Enable/ })).toBeTruthy();
		expect(screen.queryByRole('region')).toBeNull();
	});

	it('leaves the selection alone when the row menu or its delete dialog is used', async () => {
		renderSection();
		await select('github-actions');
		const row = accountButton('github-actions').closest('tr')!;
		// An open dialog aria-hides the rest of the page, so look past that.
		const panelIsOpen = () =>
			screen.queryByRole('region', { name: 'API tokens of github-actions', hidden: true }) !== null;
		await act(async () => {
			fireEvent.click(within(row).getByRole('menuitem', { name: /Delete/ }));
		});
		expect(panelIsOpen()).toBe(true);
		const dialog = await screen.findByRole('dialog');
		await act(async () => {
			fireEvent.click(within(dialog).getByRole('button', { name: /Cancel/ }));
		});
		expect(panelIsOpen()).toBe(true);
		expect(del).not.toHaveBeenCalled();
	});

	it('does not offer to mint tokens for a disabled account, and warns when its role was deleted', async () => {
		renderSection();
		const panel = await select('retired-bot');
		expect((within(panel).getByRole('button', { name: /Create token/ }) as HTMLButtonElement).disabled).toBe(true);
		expect(within(panel).getByText(/Its role was deleted/)).toBeTruthy();
	});

	it('opens the create-token dialog for the selected account', async () => {
		renderSection();
		const panel = await select('github-actions');
		await act(async () => {
			fireEvent.click(within(panel).getByRole('button', { name: /Create token/ }));
		});
		expect(screen.getByText('create token dialog for sva-ci')).toBeTruthy();
	});

	it('revokes a token after confirmation, and unlists it even if the refresh then fails', async () => {
		renderSection();
		const panel = await select('github-actions');
		const row = (await within(panel).findByText('deploy')).closest('tr')!;
		await act(async () => {
			fireEvent.click(within(row).getByRole('button', { name: 'Revoke deploy' }));
		});
		const dialog = await screen.findByRole('dialog');
		get.mockRejectedValue(new Error('down'));
		await act(async () => {
			fireEvent.click(within(dialog).getByRole('button', { name: /Revoke/ }));
		});
		expect(del).toHaveBeenCalledWith('/ApiToken/oat-live');
		await waitFor(() => expect(within(panel).queryByText('deploy')).toBeNull());
		expect(within(panel).getByText('nightly')).toBeTruthy();
	});

	it('deletes an account once for two quick confirmations, and unlists it even if the refresh then fails', async () => {
		renderSection();
		await select('github-actions');
		const row = accountButton('github-actions').closest('tr')!;
		await act(async () => {
			fireEvent.click(within(row).getByRole('menuitem', { name: /Delete/ }));
		});
		const confirm = within(await screen.findByRole('dialog')).getByRole('button', { name: /Delete/ });
		get.mockRejectedValue(new Error('down'));
		await act(async () => {
			fireEvent.click(confirm);
			fireEvent.click(confirm);
		});
		expect(del.mock.calls.filter(([url]) => url === '/ServiceAccount/sva-ci')).toHaveLength(1);
		await waitFor(() => expect(screen.queryByRole('region')).toBeNull());
		expect(screen.queryByText('github-actions')).toBeNull();
		expect(screen.getByText('retired-bot')).toBeTruthy();
	});

	it('selects a newly created account once it is listed, so its tokens can be created next', async () => {
		created.value = account({ id: 'sva-new', name: 'nightly-sync', activeTokens: 0 });
		const queryClient = renderSection();
		await screen.findByText('github-actions');
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: /Create service account/ }));
		});
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'finish creating' }));
		});
		expect(screen.queryByRole('region')).toBeNull();
		accounts.value = [...accounts.value, created.value];
		await act(async () => {
			await queryClient.invalidateQueries({ queryKey: ['org-1', 'serviceAccounts'] });
		});
		expect(await screen.findByRole('region', { name: 'API tokens of nightly-sync' })).toBeTruthy();
	});

	it('refreshes from an icon button with an accessible name', async () => {
		renderSection();
		await screen.findByText('github-actions');
		const reads = get.mock.calls.filter(([url]) => url === '/ServiceAccount/').length;
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Refresh service accounts' }));
		});
		await waitFor(() => expect(get.mock.calls.filter(([url]) => url === '/ServiceAccount/').length).toBe(reads + 1));
	});

	it('keeps showing the accounts and tokens it has when a refresh fails', async () => {
		const queryClient = renderSection();
		await select('github-actions');
		await screen.findByText('deploy');
		get.mockRejectedValue(new Error('boom'));
		await act(async () => {
			await queryClient.refetchQueries();
			// Query observers are notified on a later macrotask.
			await new Promise((resolve) => setTimeout(resolve, 0));
		});
		expect(queryClient.getQueryCache().getAll().every((query) => query.state.status === 'error')).toBe(true);
		expect(screen.getByText('retired-bot')).toBeTruthy();
		expect(screen.getByText('deploy')).toBeTruthy();
		expect(screen.queryByText(/Couldn’t load/)).toBeNull();
	});

	it('says so when there are no accounts, or they cannot be loaded', async () => {
		accounts.value = [];
		renderSection();
		expect(await screen.findByText('No service accounts yet.')).toBeTruthy();
		cleanup();
		get.mockRejectedValueOnce(new Error('boom'));
		renderSection();
		expect(await screen.findByText(/Couldn’t load service accounts/)).toBeTruthy();
	});
});
