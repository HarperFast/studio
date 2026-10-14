/** @vitest-environment jsdom */
import type { Cluster } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getInstanceUserInfo } = vi.hoisted(() => ({ getInstanceUserInfo: vi.fn() }));
vi.mock('@/integrations/api/instance/status/getInstanceUserInfo', () => ({ getInstanceUserInfo }));
vi.mock('@tanstack/react-router', () => ({
	Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
	Navigate: ({ to }: { to: string }) => <div>redirected to {to}</div>,
	useNavigate: () => vi.fn(),
	useParams: () => ({ organizationId: 'org-1', clusterId: 'clu-1' }),
	useRouter: () => ({ invalidate: vi.fn() }),
}));
vi.mock('@/components/SubNavMenu', () => ({ SubNavMenu: () => null }));
vi.mock('@/features/cluster/components/ClusterPageLayout', () => ({
	ClusterPageLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/features/cluster/components/ClusterUsageCard', () => ({ ClusterUsageCard: () => null }));
vi.mock('@/features/clusters/components/ClusterStateMenu', () => ({ ClusterStateMenu: () => null }));
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

// Fresh modules, because the store reads the remembered sign-in from storage when it is built.
async function renderOverview(status: string) {
	cluster = {
		id: 'clu-1',
		name: 'prod-east',
		organizationId: 'org-1',
		fqdn: 'prod-east.example.com',
		instances: [{ id: 'ins-1' }],
		status,
	} as Cluster;
	vi.resetModules();
	const { ClusterHome } = await import('./ClusterHome');
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	client.setQueryData(['clu-1'], cluster);
	render(
		<QueryClientProvider client={client}>
			<ClusterHome />
		</QueryClientProvider>,
	);
	await act(() => null);
}

beforeEach(() => {
	localStorage.clear();
	localStorage.setItem(
		'Studio:PotentiallyAuthenticated',
		JSON.stringify({ 'clu-1': 'https://clu-1.example.com:9925/' }),
	);
	getInstanceUserInfo.mockResolvedValue({ username: 'admin' });
});

afterEach(() => {
	cleanup();
	vi.resetAllMocks();
});

describe('the overview of a cluster with a remembered sign-in', () => {
	it.each([
		['TERMINATED', 'Cluster Terminated'],
		['TERMINATING', 'Cluster Terminating'],
	])("never checks a %s cluster's sign-in", async (status, heading) => {
		await renderOverview(status);

		expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
		expect(getInstanceUserInfo).not.toHaveBeenCalled();
	});

	it("checks a running cluster's sign-in", async () => {
		await renderOverview('RUNNING');

		expect(await screen.findByText('Enter cluster')).toBeTruthy();
		expect(getInstanceUserInfo).toHaveBeenCalledTimes(1);
	});
});
