/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { get, patch } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));

vi.mock('@/config/apiClient', () => ({ apiClient: { get, patch } }));

import { UsersAdminIndex } from './index';

const USER = {
	id: 'usr-1',
	email: 'pat@example.com',
	firstname: 'Pat',
	lastname: 'Lee',
	status: 'ACTIVE',
	organizations: [
		{ organizationId: 'org-solo', organizationName: 'Solo Co', roleNames: ['admin'], lastAdmin: true },
		{
			organizationId: 'org-shared',
			organizationName: 'Shared Co',
			roleNames: ['admin', 'developer'],
			lastAdmin: false,
		},
	],
};

beforeAll(() => {
	// Radix Dialog relies on DOM APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

let user: typeof USER;

beforeEach(() => {
	user = structuredClone(USER);
	get.mockReset();
	patch.mockReset();
	get.mockImplementation(async (url: string) => {
		if (url === '/Admin/User/?email=pat%40example.com') {
			return { data: [{ id: 'usr-old', status: 'DELETED' }, { id: 'usr-1', status: user.status }] };
		}
		if (url === '/Admin/User/usr-1?previewMembershipRemoval=true') { return { data: user }; }
		if (url.startsWith('/Admin/User/?email=')) { return { data: [] }; }
		throw new Error(`unexpected GET ${url}`);
	});
	patch.mockImplementation(async () => {
		user = { ...user, status: 'DEACTIVATED', organizations: [user.organizations[0]] };
		return {
			data: {
				id: 'usr-1',
				status: 'DEACTIVATED',
				removedFrom: [{
					organizationId: 'org-shared',
					organizationName: 'Shared Co',
					roleNames: ['admin', 'developer'],
				}],
				retainedIn: [{ organizationId: 'org-solo', organizationName: 'Solo Co', roleNames: ['admin'] }],
			},
		};
	});
});
afterEach(cleanup);

function renderPage() {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={queryClient}>
			<UsersAdminIndex />
		</QueryClientProvider>,
	);
}

async function lookUp(address: string) {
	await act(async () => {
		fireEvent.change(screen.getByLabelText('Email'), { target: { value: address } });
	});
	await act(async () => {
		fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
	});
}

describe('UsersAdminIndex', () => {
	it('looks up the live account by normalized address and previews each organization', async () => {
		renderPage();
		await lookUp('  Pat@Example.com ');

		expect(await screen.findByText('Pat Lee')).toBeTruthy();
		const solo = screen.getByText('Solo Co').closest('li')!;
		expect(within(solo).getByText('Kept: last admin')).toBeTruthy();
		const shared = screen.getByText('Shared Co').closest('li')!;
		expect(within(shared).getByText('Will be removed')).toBeTruthy();
		expect(within(shared).getByText('admin, developer')).toBeTruthy();
		expect(get).toHaveBeenCalledWith('/Admin/User/usr-1?previewMembershipRemoval=true');
	});

	it('says so when no account uses the address', async () => {
		renderPage();
		await lookUp('nobody@example.com');

		expect(await screen.findByText('No account uses nobody@example.com.')).toBeTruthy();
	});

	it('confirms, deactivates, and shows what actually happened', async () => {
		renderPage();
		await lookUp('pat@example.com');
		await act(async () => {
			fireEvent.click(await screen.findByRole('button', { name: 'Deactivate' }));
		});

		const confirm = screen.getByRole('dialog');
		expect(within(confirm).getByText('Deactivate pat@example.com?')).toBeTruthy();
		expect(within(within(confirm).getByText('Will be removed from').parentElement!).getByText('Shared Co'))
			.toBeTruthy();
		expect(within(within(confirm).getByText('Will stay in, as the last admin').parentElement!).getByText('Solo Co'))
			.toBeTruthy();

		await act(async () => {
			fireEvent.click(within(confirm).getByRole('button', { name: 'Deactivate' }));
		});

		expect(patch).toHaveBeenCalledWith('/Admin/User/usr-1', { status: 'DEACTIVATED' });
		const done = await screen.findByRole('dialog');
		expect(within(done).getByText('User deactivated')).toBeTruthy();
		expect(within(within(done).getByText('Removed from').parentElement!).getByText('Shared Co')).toBeTruthy();
		expect(within(within(done).getByText('Kept in, as the last admin').parentElement!).getByText('Solo Co'))
			.toBeTruthy();

		await act(async () => {
			fireEvent.click(within(done).getByRole('button', { name: 'Done' }));
		});
		expect(await screen.findByText('Deactivated, and in no organization it could leave.')).toBeTruthy();
	});

	it('still offers deactivation to an already-deactivated account that has memberships to remove', async () => {
		user.status = 'DEACTIVATED';
		renderPage();
		await lookUp('pat@example.com');

		expect(await screen.findByText(/Already deactivated/)).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Deactivate' })).toBeTruthy();
	});

	it('keeps the result open when the refetch after deactivating fails', async () => {
		renderPage();
		await lookUp('pat@example.com');
		await act(async () => {
			fireEvent.click(await screen.findByRole('button', { name: 'Deactivate' }));
		});
		get.mockRejectedValue(new Error('network down'));
		await act(async () => {
			fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate' }));
		});

		expect(await screen.findByText(/Could not refresh this account/)).toBeTruthy();
		const done = screen.getByRole('dialog');
		expect(within(done).getByText('User deactivated')).toBeTruthy();
		expect(within(within(done).getByText('Removed from').parentElement!).getByText('Shared Co')).toBeTruthy();
	});

	it('looks the same address up again when asked', async () => {
		const answer = get.getMockImplementation()!;
		get.mockRejectedValueOnce(new Error('timeout'));
		renderPage();
		await lookUp('pat@example.com');
		expect(await screen.findByText('timeout')).toBeTruthy();

		get.mockImplementation(answer);
		await lookUp('pat@example.com');
		expect(await screen.findByText('Pat Lee')).toBeTruthy();
	});

	it('refuses a central manager that answers without the preview', async () => {
		const { organizations: _omitted, ...plainRecord } = user;
		get.mockImplementation(async (url: string) =>
			url.includes('?email=') ? { data: [{ id: 'usr-1', status: 'ACTIVE' }] } : { data: plainRecord }
		);
		renderPage();
		await lookUp('pat@example.com');

		expect(await screen.findByText(/cannot preview organization memberships/)).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Deactivate' })).toBeNull();
	});

	it('keeps the address out of the duplicate-account error', async () => {
		get.mockResolvedValueOnce({ data: [{ id: 'usr-1', status: 'ACTIVE' }, { id: 'usr-2', status: 'ACTIVE' }] });
		renderPage();
		await lookUp('pat@example.com');

		const message = await screen.findByText(/More than one live account/);
		expect(message.textContent).not.toContain('pat@example.com');
	});
});
