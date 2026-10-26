/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { get, patch } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));

vi.mock('@/config/apiClient', () => ({ apiClient: { get, patch } }));

import { UsersAdminLayout } from '@/features/admin/users/index';
import { DuplicateAccountError, findUserIdByEmail } from '@/features/admin/users/userAdminApi';
import { UserDetailsPage } from '@/features/admin/users/UserDetails';

const USER = {
	id: 'usr-1',
	email: 'pat@example.com',
	firstname: 'Pat',
	lastname: 'Lee',
	status: 'ACTIVE',
	isVerified: true,
	organizations: [
		{ organizationId: 'org-solo', organizationName: 'Solo Co', roleNames: ['admin'], lastAdmin: true, clusters: [] },
		{
			organizationId: 'org-shared',
			organizationName: 'Shared Co',
			roleNames: ['admin', 'developer'],
			lastAdmin: false,
			clusters: [
				{ id: 'clu-a', name: 'alpha', status: 'RUNNING' },
				{ id: 'clu-b', name: 'beta', status: 'FAILED' },
			],
		},
	],
};

const OTHER = {
	id: 'usr-2',
	email: 'sam@example.com',
	firstname: 'Sam',
	lastname: 'Ray',
	status: 'ACTIVE',
	organizations: [],
};

beforeAll(() => {
	// Radix Dialog relies on DOM APIs jsdom doesn't implement.
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
});

const notFound = () => new AxiosError('Not Found', '404', undefined, undefined, { status: 404 } as never);

let user: typeof USER;

beforeEach(() => {
	user = structuredClone(USER);
	get.mockReset();
	patch.mockReset();
	get.mockImplementation(async (url: string) => {
		if (url === '/Admin/User/?email=pat%40example.com') {
			return { data: [{ id: 'usr-old', status: 'DELETED' }, { id: 'usr-1', status: user.status }] };
		}
		if (url.startsWith('/Admin/User/?email=')) { return { data: [] }; }
		if (url === '/Admin/User/usr-1?details=true') { return { data: user }; }
		if (url === '/Admin/User/usr-2?details=true') { return { data: OTHER }; }
		if (url.endsWith('?details=true')) { throw notFound(); }
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
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

/** The admin users routes as the app nests them, without the admin shell's auth around them. */
async function renderAt(path = '/admin/users') {
	const rootRoute = createRootRoute({ component: Outlet });
	const usersRoute = createRoute({ getParentRoute: () => rootRoute, path: 'admin/users', component: UsersAdminLayout });
	const routeTree = rootRoute.addChildren([
		usersRoute.addChildren([
			createRoute({ getParentRoute: () => usersRoute, path: '/' }),
			createRoute({ getParentRoute: () => usersRoute, path: '$userId', component: UserDetailsPage }),
		]),
		createRoute({ getParentRoute: () => rootRoute, path: 'elsewhere', component: () => <p>Elsewhere</p> }),
	]);
	const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) });
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router as never} />
		</QueryClientProvider>,
	);
	await screen.findByLabelText('Email or user ID');
	return router;
}

async function lookUp(value: string) {
	await act(async () => {
		fireEvent.change(screen.getByLabelText('Email or user ID'), { target: { value } });
	});
	await act(async () => {
		fireEvent.click(screen.getByRole('button', { name: 'Look up' }));
	});
}

async function confirmDeactivation() {
	await act(async () => {
		fireEvent.click(await screen.findByRole('button', { name: 'Deactivate' }));
	});
	await act(async () => {
		fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate' }));
	});
}

describe('admin users', () => {
	it('looks up the live account by normalized address and opens it by id, keeping the address out of the URL', async () => {
		const router = await renderAt();
		await lookUp('  Pat@Example.com ');

		expect(await screen.findByText('Pat Lee')).toBeTruthy();
		expect(router.state.location.href).toBe('/admin/users/usr-1');
		expect(get).toHaveBeenCalledWith('/Admin/User/?email=pat%40example.com');
		expect(get).toHaveBeenCalledWith('/Admin/User/usr-1?details=true');
	});

	it('shows each organization with its roles, its deactivation marking and its live clusters', async () => {
		await renderAt('/admin/users/usr-1');

		const stat = (label: string) => screen.getByText(label, { selector: 'dt' }).parentElement!;
		await screen.findByText('Pat Lee');
		expect(within(stat('Organizations')).getByText('2')).toBeTruthy();
		expect(within(stat('Organizations')).getByText('Admin of 2')).toBeTruthy();
		expect(within(stat('Live clusters')).getByText('2')).toBeTruthy();
		expect(within(stat('Live clusters')).getByText('1 running')).toBeTruthy();

		const solo = screen.getByText('Solo Co').closest('li')!;
		expect(within(solo).getByText('Kept: last admin')).toBeTruthy();
		expect(within(solo).getByText('0 live clusters')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Solo Co' }).getAttribute('href')).toBe('/org-solo');

		const shared = screen.getByText('Shared Co').closest('li')!;
		expect(within(shared).getByText('Removed on deactivation')).toBeTruthy();
		expect(within(shared).getByText('admin')).toBeTruthy();
		expect(within(shared).getByText('developer')).toBeTruthy();
		expect(within(shared).getByRole('link', { name: 'alpha' }).getAttribute('href')).toBe('/org-shared/clu-a');
		expect(within(shared).getByText('Failed')).toBeTruthy();
	});

	it("folds an organization's clusters away and back", async () => {
		await renderAt('/admin/users/usr-1');
		const toggle = await screen.findByRole('button', { name: 'Hide the clusters of Shared Co' });

		await act(async () => {
			fireEvent.click(toggle);
		});
		expect(screen.queryByRole('link', { name: 'alpha' })).toBeNull();

		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Show the clusters of Shared Co' }));
		});
		expect(screen.getByRole('link', { name: 'alpha' })).toBeTruthy();
	});

	it('opens a pasted user id without looking up an address', async () => {
		const router = await renderAt();
		await lookUp(' usr-2 ');

		expect(await screen.findByText('Sam Ray')).toBeTruthy();
		expect(router.state.location.href).toBe('/admin/users/usr-2');
		expect(get.mock.calls.some(([url]) => url.includes('?email='))).toBe(false);
	});

	it('encodes the address it looks up', async () => {
		await renderAt();
		await lookUp('pat+ops@example.com');

		expect(await screen.findByText('No account uses pat+ops@example.com.')).toBeTruthy();
		expect(get).toHaveBeenCalledWith('/Admin/User/?email=pat%2Bops%40example.com');
	});

	it('leaves the open account when no account uses the address', async () => {
		const router = await renderAt('/admin/users/usr-1');
		await screen.findByText('Pat Lee');
		await lookUp('nobody@example.com');

		expect(await screen.findByText('No account uses nobody@example.com.')).toBeTruthy();
		expect(router.state.location.href).toBe('/admin/users');
		expect(screen.queryByText('Pat Lee')).toBeNull();
	});

	it('says so when no account has the ID', async () => {
		await renderAt('/admin/users/usr-missing');

		expect(await screen.findByText('No account has the ID usr-missing.')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Deactivate' })).toBeNull();
	});

	it('closes the open account on a duplicate address, keeping the address out of the error and unreported', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const router = await renderAt('/admin/users/usr-1');
		await screen.findByText('Pat Lee');
		get.mockResolvedValueOnce({ data: [{ id: 'usr-1', status: 'ACTIVE' }, { id: 'usr-2', status: 'ACTIVE' }] });
		await lookUp('pat@example.com');

		const message = await screen.findByText(/More than one live account/);
		expect(message.textContent).not.toContain('pat@example.com');
		expect(router.state.location.href).toBe('/admin/users');
		expect(screen.queryByText('Pat Lee')).toBeNull();
		expect(consoleError).not.toHaveBeenCalledWith(expect.any(DuplicateAccountError));
	});

	it('reports a failed lookup, shows the reason central manager gave, and closes the open account', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
		const failure = new AxiosError('Request failed with status code 500', '500', undefined, undefined, {
			status: 500,
			data: { code: 'ServerError', title: 'Lookup unavailable' },
		} as never);
		const router = await renderAt('/admin/users/usr-1');
		await screen.findByText('Pat Lee');
		get.mockRejectedValueOnce(failure);
		await lookUp('pat@example.com');

		expect(await screen.findByText('Lookup unavailable')).toBeTruthy();
		expect(consoleError).toHaveBeenCalledWith(failure);
		expect(router.state.location.href).toBe('/admin/users');
		expect(screen.queryByText('Pat Lee')).toBeNull();
	});

	it('drops an email lookup that answers after the page was left', async () => {
		let answer!: (value: unknown) => void;
		const router = await renderAt();
		get.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
		await lookUp('pat@example.com');

		await act(async () => {
			await router.navigate({ to: '/elsewhere' } as never);
		});
		await act(async () => {
			answer({ data: [{ id: 'usr-1', status: 'ACTIVE' }] });
		});

		expect(router.state.location.href).toBe('/elsewhere');
		expect(screen.getByText('Elsewhere')).toBeTruthy();
	});

	it('offers no deactivation, and no membership marking, for a deleted account', async () => {
		user.status = 'DELETED';
		await renderAt('/admin/users/usr-1');

		expect(await screen.findByText('This account is deleted, so it cannot be deactivated.')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Deactivate' })).toBeNull();
		expect(screen.queryByText('Removed on deactivation')).toBeNull();
		expect(screen.queryByText('Kept: last admin')).toBeNull();
	});

	it('looks the same address up again when asked, refreshing the open account', async () => {
		const answer = get.getMockImplementation()!;
		get.mockRejectedValueOnce(new Error('timeout'));
		await renderAt();
		await lookUp('pat@example.com');
		expect(await screen.findByText('timeout')).toBeTruthy();

		get.mockImplementation(answer);
		await lookUp('pat@example.com');
		expect(await screen.findByText('Pat Lee')).toBeTruthy();

		user = { ...user, firstname: 'Patricia' };
		await lookUp('pat@example.com');
		expect(await screen.findByText('Patricia Lee')).toBeTruthy();
	});

	it('refuses a central manager that answers without the details view', async () => {
		const { organizations: _omitted, ...plainRecord } = user;
		get.mockResolvedValue({ data: plainRecord });
		await renderAt('/admin/users/usr-1');

		expect(await screen.findByText(/cannot show user details/)).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Deactivate' })).toBeNull();
	});

	it('confirms, deactivates, and shows what actually happened', async () => {
		await renderAt('/admin/users/usr-1');
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
		await renderAt('/admin/users/usr-1');

		expect(await screen.findByText(/Already deactivated/)).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Deactivate' })).toBeTruthy();
	});

	it('keeps the result open when the refetch after deactivating fails', async () => {
		await renderAt('/admin/users/usr-1');
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

	it('keeps the result open when the refetch finds no account any more', async () => {
		await renderAt('/admin/users/usr-1');
		await act(async () => {
			fireEvent.click(await screen.findByRole('button', { name: 'Deactivate' }));
		});
		get.mockRejectedValue(notFound());
		await act(async () => {
			fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Deactivate' }));
		});

		expect(await screen.findByText('No account has the ID usr-1.')).toBeTruthy();
		const done = screen.getByRole('dialog');
		expect(within(within(done).getByText('Removed from').parentElement!).getByText('Shared Co')).toBeTruthy();
	});

	it('closes the confirm dialog when the PATCH fails', async () => {
		patch.mockRejectedValueOnce(new Error('no answer'));
		await renderAt('/admin/users/usr-1');
		await confirmDeactivation();

		expect(screen.queryByRole('dialog')).toBeNull();
	});

	it('says so when a successful PATCH does not report the organizations', async () => {
		patch.mockResolvedValueOnce({ data: '' });
		await renderAt('/admin/users/usr-1');
		await confirmDeactivation();

		const done = await screen.findByRole('dialog');
		expect(within(done).getByText('User deactivated')).toBeTruthy();
		expect(within(done).getAllByText('Not reported by the server.')).toHaveLength(2);
	});

	it('drops an open confirmation when moving to another account', async () => {
		const router = await renderAt('/admin/users/usr-1');
		await act(async () => {
			fireEvent.click(await screen.findByRole('button', { name: 'Deactivate' }));
		});
		expect(screen.getByRole('dialog')).toBeTruthy();

		await act(async () => {
			await router.navigate({ to: '/admin/users/$userId', params: { userId: 'usr-2' } } as never);
		});

		expect(await screen.findByText('Sam Ray')).toBeTruthy();
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(patch).not.toHaveBeenCalled();
	});
});

describe('findUserIdByEmail', () => {
	it('refuses a blank address without asking central manager', async () => {
		await expect(findUserIdByEmail('   ')).rejects.toThrow('Enter an address');
		expect(get).not.toHaveBeenCalled();
	});

	it('refuses an answer that is not a list', async () => {
		get.mockResolvedValueOnce({ data: '' });
		await expect(findUserIdByEmail('pat@example.com')).rejects.toThrow('did not answer with a list');
	});
});
