/** @vitest-environment jsdom */
import type { Cluster } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toastError = vi.hoisted(() => vi.fn());
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }));

const { viewer, useOwedPresetSetup } = vi.hoisted(() => ({
	viewer: { user: null as { username: string } | null, superUser: false, update: true, readOnlyConnect: false },
	useOwedPresetSetup: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => {
	const router = { invalidate: vi.fn() };
	return {
		Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
		Navigate: ({ to }: { to: string }) => <div>redirected to {to}</div>,
		useNavigate: () => vi.fn(),
		useParams: () => ({ organizationId: 'org-1', clusterId: 'clu-1' }),
		useRouteContext: () => ({}),
		useRouter: () => router,
	};
});
vi.mock('@/components/SubNavMenu', () => ({ SubNavMenu: () => null }));
const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/config/apiClient', () => ({ apiClient: { get: apiGet } }));
vi.mock('@/features/cluster/components/ClusterPageLayout', () => ({
	ClusterPageLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/features/cluster/components/ClusterUsageCard', () => ({ ClusterUsageCard: () => null }));
vi.mock('@/features/clusters/components/ClusterStateMenu', () => ({ ClusterStateMenu: () => null }));
vi.mock('@/hooks/useAuth', () => ({
	useInstanceAuth: () => ({ user: viewer.user, isLoading: false }),
	useStaffPermission: () => viewer.readOnlyConnect,
}));
vi.mock('@/hooks/usePermissions', () => ({
	useOrganizationClusterPermissions: () => ({ view: true, update: viewer.update }),
	useInstanceManagePermission: () => viewer.superUser,
}));
vi.mock('@/features/clusters/presets/usePresetSetup', () => ({ useOwedPresetSetup }));

let cluster: Cluster;
vi.mock('@/features/cluster/queries/getClusterInfoQuery', () => ({
	getClusterInfoQueryOptions: (clusterId: string) => ({
		queryKey: [clusterId],
		queryFn: async () => cluster,
		staleTime: Infinity,
	}),
}));

import { DirectConnectionRequiredError } from '@/features/auth/scopedOperationToken';
import { authStore } from '@/features/auth/store/authStore';
import { ClusterHome } from './ClusterHome';

beforeEach(() => {
	viewer.user = null;
	viewer.superUser = false;
	viewer.update = true;
	viewer.readOnlyConnect = false;
	useOwedPresetSetup.mockReset();
});
afterEach(() => {
	cleanup();
	apiGet.mockReset();
	toastError.mockReset();
	vi.restoreAllMocks();
});

async function renderHome(state: Cluster) {
	cluster = state;
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	client.setQueryData(['clu-1'], state);
	render(
		<QueryClientProvider client={client}>
			<ClusterHome />
		</QueryClientProvider>,
	);
	await act(() => null);
	return client;
}

const base = {
	id: 'clu-1',
	name: 'prod-east',
	organizationId: 'org-1',
	fqdn: 'prod-east.example.com',
	instances: [],
} as unknown as Cluster;

describe(ClusterHome, () => {
	it('shows a terminated cluster as gone rather than offering to connect to it', async () => {
		await renderHome({ ...base, status: 'TERMINATED' });
		expect(screen.getByRole('heading', { name: 'Cluster Terminated' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Direct sign-in' })).toBeNull();
	});

	it('shows a cluster whose delete is still running as terminating, and names the members of a delete that stopped', async () => {
		apiGet.mockResolvedValue({
			data: {
				id: 'wf-1',
				type: 'DELETE_CLUSTER',
				status: 'PAUSED',
				pause: { reason: 'failed', at: '2026-11-06T00:00:00.000Z' },
				failedInstanceIds: ['ins-2'],
				message: 'Instance ins-2 did not confirm the deletion in time.',
			},
		});
		await renderHome({
			...base,
			status: 'TERMINATING',
			instances: [{ id: 'ins-1', name: 'east-1' }, { id: 'ins-2', name: 'west-1' }],
		} as unknown as Cluster);
		expect(screen.getByRole('heading', { name: 'Cluster Terminating' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Direct sign-in' })).toBeNull();
		expect((await screen.findByRole('status')).textContent).toContain(
			'Termination stoppedInstance west-1 did not confirm the deletion in time.',
		);
		expect(apiGet).toHaveBeenCalledWith('/Cluster/clu-1/workflow');
	});

	it('drops the notice and reads no more once the cluster is gone', async () => {
		apiGet.mockResolvedValue({
			data: {
				id: 'wf-1',
				type: 'DELETE_CLUSTER',
				status: 'PAUSED',
				pause: { reason: 'failed' },
				failedInstanceIds: [],
			},
		});
		const terminating = { ...base, status: 'TERMINATING', workflowId: 'wf-1' } as Cluster;
		const client = await renderHome(terminating);
		await screen.findByRole('status');
		await act(async () => {
			client.setQueryData(['clu-1'], { ...terminating, status: 'TERMINATED', workflowId: null });
			await new Promise((resolve) => setTimeout(resolve));
		});
		expect(screen.getByRole('heading', { name: 'Cluster Terminated' })).toBeTruthy();
		expect(screen.queryByRole('status')).toBeNull();
		expect(apiGet).toHaveBeenCalledTimes(1);
	});

	it('calls a self-hosted cluster whose removal is still running removing, not removed', async () => {
		apiGet.mockResolvedValue({
			data: { id: 'wf-1', type: 'DELETE_CLUSTER', status: 'RUNNING', failedInstanceIds: [] },
		});
		await renderHome({ ...base, status: 'TERMINATING', plans: [{ planId: 'self-hosted-free' }] } as unknown as Cluster);
		expect(screen.getByRole('heading', { name: 'Cluster Removing' })).toBeTruthy();
	});

	it('reads no workflow for a cluster that is already gone', async () => {
		await renderHome({ ...base, status: 'TERMINATED' });
		expect(apiGet).not.toHaveBeenCalled();
		expect(screen.queryByRole('status')).toBeNull();
	});

	it('shows a failed build that central manager rolled back (FAILED with terminatedAt) as gone', async () => {
		await renderHome({ ...base, status: 'FAILED', terminatedAt: '2026-08-13T00:00:00.000Z' });
		expect(screen.getByRole('heading', { name: 'Cluster Terminated' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Direct sign-in' })).toBeNull();
	});

	it('still offers to connect to a FAILED cluster without terminatedAt, which may still be serving', async () => {
		await renderHome({ ...base, status: 'FAILED' });
		expect(screen.getByRole('button', { name: 'Direct sign-in' })).toBeTruthy();
		expect(screen.queryByRole('heading', { name: 'Cluster Terminated' })).toBeNull();
	});

	it('still offers to connect to a running cluster', async () => {
		await renderHome({ ...base, status: 'RUNNING' });
		expect(screen.getByRole('button', { name: 'Direct sign-in' })).toBeTruthy();
		expect(screen.queryByRole('heading', { name: 'Cluster Terminated' })).toBeNull();
	});

	it('offers Fabric Connect to staff who may connect read-only without update rights', async () => {
		viewer.update = false;
		viewer.readOnlyConnect = true;
		await renderHome({ ...base, status: 'RUNNING' });
		expect(screen.getByRole('button', { name: 'Fabric Connect' })).toBeTruthy();
	});

	it('tells read-only staff why connecting failed, since they have no sign-in to fall back on', async () => {
		viewer.update = false;
		viewer.readOnlyConnect = true;
		vi.spyOn(authStore, 'establishFabricConnectAuth').mockRejectedValue(
			new DirectConnectionRequiredError('unreachable'),
		);
		await renderHome({ ...base, status: 'RUNNING' });
		fireEvent.click(screen.getByRole('button', { name: 'Fabric Connect' }));

		await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
		expect(toastError.mock.calls[0][0]).toMatch(/^Read-only access unavailable/);
		expect(JSON.stringify(toastError.mock.calls[0])).toContain('could not reach it');
	});

	it('stays quiet when a sign-out interrupts connecting', async () => {
		const connect = vi.spyOn(authStore, 'establishFabricConnectAuth')
			.mockRejectedValue(Object.assign(new Error('signed out'), { name: 'SignedOutWhileConnectingError' }));
		await renderHome({ ...base, status: 'RUNNING' });
		fireEvent.click(screen.getByRole('button', { name: 'Fabric Connect' }));

		await waitFor(() => expect(connect).toHaveBeenCalled());
		await act(async () => {});
		expect(toastError).not.toHaveBeenCalled();
	});

	it('offers no Fabric Connect to a viewer who can neither update nor connect read-only', async () => {
		viewer.update = false;
		await renderHome({ ...base, status: 'RUNNING' });
		expect(screen.queryByRole('button', { name: 'Fabric Connect' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Direct sign-in' })).toBeTruthy();
	});
});

describe('ClusterHome for a cluster that still owes its preset setup', () => {
	beforeEach(() => {
		viewer.user = { username: 'admin' };
		useOwedPresetSetup.mockReturnValue({ id: 'redirects', name: 'HTTP redirects' });
	});

	it('sends a super user to finish the setup', async () => {
		viewer.superUser = true;
		await renderHome({ ...base, status: 'RUNNING' });
		const link = screen.getByRole('link', { name: /Finish setting up HTTP redirects/ });
		expect(link.getAttribute('href')).toBe('/org-1/clu-1/setup');
		expect(useOwedPresetSetup).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'clu-1' }), true);
	});

	it('lets anyone else enter the cluster, without reading its setup state', async () => {
		await renderHome({ ...base, status: 'RUNNING' });
		const link = screen.getByRole('link', { name: /Enter cluster/ });
		expect(link.getAttribute('href')).toBe('/org-1/clu-1/start');
		expect(screen.queryByText(/Finish setting up/)).toBeNull();
		expect(useOwedPresetSetup).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'clu-1' }), false);
	});
});
