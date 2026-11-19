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
		useRouteContext: () => ({}),
		useRouter: () => router,
	};
});
vi.mock('@/components/SubNavMenu', () => ({ SubNavMenu: () => null }));
vi.mock('@/features/cluster/components/ClusterPageLayout', () => ({
	ClusterPageLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/features/cluster/components/ClusterUsageCard', () => ({ ClusterUsageCard: () => null }));
vi.mock('@/features/clusters/components/ClusterStateMenu', () => ({ ClusterStateMenu: () => null }));
const useInstanceAuth = vi.fn(() => ({ user: null, isLoading: false }));
vi.mock('@/hooks/useAuth', () => ({ useInstanceAuth: () => useInstanceAuth() }));
const permissions = { view: true, update: true };
vi.mock('@/hooks/usePermissions', () => ({
	useOrganizationClusterPermissions: () => permissions,
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
	useInstanceAuth.mockClear();
	permissions.update = true;
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

	const paymentStoppedPendingSetup = {
		...base,
		status: 'STOPPED',
		resetPassword: true,
		suspendedReason: 'PAYMENT_FAILED',
		grant: { isActive: true, source: 'purchased' } as Cluster['grant'],
	};

	it('keeps a stopped cluster whose start is refused off the setup pages, with nothing to connect', async () => {
		await renderHome(paymentStoppedPendingSetup);
		expect(screen.queryByText(/redirected to/)).toBeNull();
		expect(screen.getByRole('heading', { name: 'prod-east' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Direct sign-in' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Fabric Connect' })).toBeNull();
		expect(useInstanceAuth).not.toHaveBeenCalled();
	});

	it('still shows Pending Owner Setup to a view-only member of such a cluster', async () => {
		permissions.update = false;
		await renderHome(paymentStoppedPendingSetup);
		expect(screen.getByRole('heading', { name: 'Pending Owner Setup' })).toBeTruthy();
		expect(useInstanceAuth).not.toHaveBeenCalled();
	});

	it('still holds an ordinary stopped cluster with setup pending on starting-up', async () => {
		await renderHome({ ...base, status: 'STOPPED', resetPassword: true });
		expect(screen.getByText('redirected to /org-1/clu-1/starting-up')).toBeTruthy();
	});
});
