/** @vitest-environment jsdom */
import type { Cluster } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { viewer, useOwedPresetSetup } = vi.hoisted(() => ({
	viewer: { user: null as { username: string } | null, superUser: false },
	useOwedPresetSetup: vi.fn(),
}));

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
vi.mock('@/features/cluster/components/ClusterPageLayout', () => ({
	ClusterPageLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/features/cluster/components/ClusterUsageCard', () => ({ ClusterUsageCard: () => null }));
vi.mock('@/features/clusters/components/ClusterStateMenu', () => ({ ClusterStateMenu: () => null }));
vi.mock('@/hooks/useAuth', () => ({ useInstanceAuth: () => ({ user: viewer.user, isLoading: false }) }));
vi.mock('@/hooks/usePermissions', () => ({
	useOrganizationClusterPermissions: () => ({ view: true, update: true }),
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

import { ClusterHome } from './ClusterHome';

beforeEach(() => {
	viewer.user = null;
	viewer.superUser = false;
	useOwedPresetSetup.mockReset();
});
afterEach(() => cleanup());

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
