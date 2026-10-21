/** @vitest-environment jsdom */
import { authStore } from '@/features/auth/store/authStore';
import type { LocalUser } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/Breadcrumbs', () => ({ Breadcrumbs: () => null }));
vi.mock('@/hooks/useAuth', () => ({ useCloudAuth: () => ({ user: { email: 'owner@example.com' } }) }));
vi.mock('@/lib/urls/getOperationsUrlForCluster', () => ({
	getOperationsUrlForCluster: () => 'https://clu-1.example.com:9925/',
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const cluster = {
	id: 'clu-1',
	organizationId: 'org-1',
	resetPassword: true,
	status: 'RUNNING',
	instances: [{ id: 'ins-1', status: 'RUNNING', tempPassword: 'temp-password' }],
};
const resetPassword = vi.fn(async () => ({
	message: 'Login successful',
	user: { username: 'owner@example.com' } as LocalUser,
}));
vi.mock('@/integrations/api/instance/auth/useInstanceResetPasswordMutation', async () => {
	const { useMutation } = await import('@tanstack/react-query');
	return { useInstanceResetPasswordMutation: () => useMutation({ mutationFn: resetPassword }) };
});

import { FinishSetup } from './FinishSetup';

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	resetPassword.mockClear();
});

let releaseHome = () => {};

function renderAt(path: string, client: QueryClient) {
	const rootRoute = createRootRoute({ component: Outlet });
	const organizationRoute = createRoute({ getParentRoute: () => rootRoute, path: '$organizationId' });
	const clusterRoute = createRoute({ getParentRoute: () => organizationRoute, path: '$clusterId' });
	const router = createRouter({
		history: createMemoryHistory({ initialEntries: [path] }),
		routeTree: rootRoute.addChildren([
			organizationRoute.addChildren([
				clusterRoute.addChildren([
					createRoute({
						getParentRoute: () => clusterRoute,
						path: '/',
						// The real home loads before it renders, so the page that sent the user there stays mounted meanwhile.
						loader: () => new Promise<void>(resolve => (releaseHome = resolve)),
						component: () => <p>cluster home</p>,
					}),
					createRoute({ getParentRoute: () => clusterRoute, path: 'finish-setup', component: FinishSetup }),
					createRoute({ getParentRoute: () => clusterRoute, path: 'sign-in', component: () => <p>sign in</p> }),
				]),
			]),
		]),
	});
	const visited: string[] = [];
	router.history.subscribe(({ location }) => visited.push(location.pathname));
	render(
		<QueryClientProvider client={client}>
			<RouterProvider router={router} />
		</QueryClientProvider>,
	);
	return { router, visited };
}

async function submitAdminUser() {
	await waitFor(() => expect(screen.getByLabelText('Confirm Password')).toBeTruthy());
	fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'a-strong-password-1' } });
	fireEvent.change(screen.getByLabelText('Confirm Password'), { target: { value: 'a-strong-password-1' } });
	fireEvent.click(screen.getByRole('button', { name: 'Create Admin User' }));
}

describe('FinishSetup routing', () => {
	it('lands on the cluster home once the admin user is created', async () => {
		vi.spyOn(authStore, 'setUserForEntity').mockImplementation(() => undefined);
		const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
		client.setQueryData(['clu-1'], cluster);
		const { router, visited } = renderAt('/org-1/clu-1/finish-setup', client);

		await submitAdminUser();

		await waitFor(() => expect(resetPassword).toHaveBeenCalledTimes(1));
		await waitFor(() => expect(router.state.status).toBe('pending'));
		expect(screen.getByRole('button', { name: 'Create Admin User' })).toHaveProperty('disabled', true);
		releaseHome();
		await waitFor(() => expect(router.state.status).toBe('idle'));
		expect(visited.length).toBeGreaterThan(0);
		expect(visited.filter(pathname => !pathname.startsWith('/org-1/clu-1'))).toEqual([]);
		expect(router.state.location.pathname).toBe('/org-1/clu-1');
		expect(screen.getByText('cluster home')).toBeTruthy();
	});

	it('stays on the form when a poll reports the password set before setup finishes', async () => {
		vi.spyOn(authStore, 'setUserForEntity').mockImplementation(() => undefined);
		let finishSetup = () => {};
		resetPassword.mockImplementationOnce(() =>
			new Promise(resolve => {
				finishSetup = () =>
					resolve({ message: 'Login successful', user: { username: 'owner@example.com' } as LocalUser });
			})
		);
		const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
		client.setQueryData(['clu-1'], cluster);
		const { router } = renderAt('/org-1/clu-1/finish-setup', client);

		await submitAdminUser();
		await waitFor(() => expect(resetPassword).toHaveBeenCalledTimes(1));
		act(() => client.setQueryData(['clu-1'], { ...cluster, resetPassword: false }));
		await act(() => new Promise(resolve => setTimeout(resolve, 20)));
		expect(router.state.location.pathname).toBe('/org-1/clu-1/finish-setup');

		finishSetup();
		await waitFor(() => expect(router.state.status).toBe('pending'));
		releaseHome();
		await waitFor(() => expect(screen.getByText('cluster home')).toBeTruthy());
		expect(authStore.setUserForEntity).toHaveBeenCalledTimes(1);
	});
});
