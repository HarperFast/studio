/** @vitest-environment jsdom */
import type { Cluster } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => {
	const router = { invalidate: vi.fn() };
	return {
		Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
		Navigate: ({ to }: { to: string }) => <div>redirected to {to}</div>,
		useNavigate: () => vi.fn(),
		useParams: () => ({ organizationId: 'org-1', clusterId: 'clu-1' }),
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
vi.mock('@/hooks/useAuth', () => ({ useInstanceAuth: () => ({ user: null, isLoading: false }) }));
vi.mock('@/hooks/usePermissions', () => ({
	useOrganizationClusterPermissions: () => ({ view: true, update: true }),
}));

let cluster: Cluster;
vi.mock('@/features/cluster/queries/getClusterInfoQuery', () => ({
	getClusterInfoQueryOptions: (clusterId: string) => ({
		queryKey: [clusterId],
		queryFn: async () => cluster,
		staleTime: Infinity,
	}),
}));

import { ClusterHome } from './ClusterHome';

afterEach(() => {
	cleanup();
	apiGet.mockReset();
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
});
