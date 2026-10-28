/** @vitest-environment jsdom */
import { authStore } from '@/features/auth/store/authStore';
import type { Cluster } from '@/integrations/api/api.patch';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let routeParams: { clusterId: string; instanceId?: string } = { clusterId: 'clu-1' };
vi.mock('@tanstack/react-router', () => {
	const router = { invalidate: vi.fn() };
	return {
		Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
		Navigate: ({ to }: { to: string }) => <div>redirected to {to}</div>,
		useNavigate: () => vi.fn(),
		useParams: () => routeParams,
		useRouter: () => router,
		useSearch: () => ({}),
	};
});
vi.mock('@/components/Breadcrumbs', () => ({ Breadcrumbs: () => null }));

const instanceClient = { get: vi.fn(), post: vi.fn(), defaults: {} };
vi.mock('@/config/useInstanceClient', () => ({
	useInstanceClientIdParams: () => ({ entityId: 'clu-1', entityType: 'cluster', instanceClient }),
}));

let cluster: Cluster;
vi.mock('@/features/cluster/queries/getClusterInfoQuery', () => ({
	getClusterInfoQueryOptions: (clusterId: string) => ({
		queryKey: [clusterId],
		queryFn: async () => cluster,
		staleTime: Infinity,
	}),
}));

import { ClusterInstanceSignIn } from './ClusterInstanceSignIn';

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	vi.restoreAllMocks();
	routeParams = { clusterId: 'clu-1' };
});

function clusterWith(overrides: Partial<Cluster>): Cluster {
	return {
		id: 'clu-1',
		name: 'prod-east',
		organizationId: 'org-1',
		fqdn: 'prod-east.example.com',
		status: 'RUNNING',
		instances: [],
		...overrides,
	} as Cluster;
}

async function renderSignIn(state: Cluster) {
	cluster = state;
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	client.setQueryData(['clu-1'], state);
	render(
		<QueryClientProvider client={client}>
			<ClusterInstanceSignIn />
		</QueryClientProvider>,
	);
	await act(() => null);
}

describe(ClusterInstanceSignIn, () => {
	it('says a terminated cluster is gone instead of offering a sign-in that cannot reach it', async () => {
		await renderSignIn(clusterWith({ status: 'TERMINATED' }));
		expect(screen.getByRole('heading', { name: 'Cluster Terminated' })).toBeTruthy();
		expect(screen.getByText('prod-east')).toBeTruthy();
		expect(screen.getByRole('link', { name: /Back to clusters/ }).getAttribute('href')).toBe('/org-1');
		expect(screen.queryByRole('button', { name: /Back to clusters/ })).toBeNull();
		expect(screen.queryByLabelText('Password')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Sign In' })).toBeNull();
		expect(instanceClient.get).not.toHaveBeenCalled();
	});

	it('sends a cluster without a domain to its instances by absolute path', async () => {
		await renderSignIn(clusterWith({ fqdn: undefined }));
		expect(screen.getByText('redirected to /org-1/clu-1/instances')).toBeTruthy();
		expect(instanceClient.get).not.toHaveBeenCalled();
	});

	it('sends an instance without an address to the cluster instances page', async () => {
		routeParams = { clusterId: 'clu-1', instanceId: 'ins-1' };
		const flagSpy = vi.spyOn(authStore, 'flagForFabricConnect');
		await renderSignIn(clusterWith({ instances: [{ id: 'ins-1', status: 'RUNNING' }] as Cluster['instances'] }));
		expect(flagSpy).not.toHaveBeenCalled();
		expect(screen.getByText('redirected to /org-1/clu-1/instances')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Sign In' })).toBeNull();
		expect(instanceClient.get).not.toHaveBeenCalled();
	});

	it('still offers the sign-in form for an instance with an address', async () => {
		routeParams = { clusterId: 'clu-1', instanceId: 'ins-1' };
		const flagSpy = vi.spyOn(authStore, 'flagForFabricConnect');
		instanceClient.get.mockResolvedValue({ data: {} });
		await renderSignIn(
			clusterWith({
				instances: [{ id: 'ins-1', status: 'RUNNING', instanceFqdn: 'ins-1.example.com' }] as Cluster['instances'],
			}),
		);
		expect(screen.getByRole('button', { name: 'Sign In' })).toBeTruthy();
		expect(screen.queryByText(/redirected to/)).toBeNull();
		expect(flagSpy).toHaveBeenCalledWith('ins-1', false);
	});

	it('takes precedence over the setup redirect a terminated cluster can still carry', async () => {
		await renderSignIn(clusterWith({ status: 'TERMINATED', resetPassword: true }));
		expect(screen.getByRole('heading', { name: 'Cluster Terminated' })).toBeTruthy();
		expect(screen.queryByText(/redirected to/)).toBeNull();
	});

	it('describes a cluster still being terminated as in progress, without the sign-in form', async () => {
		await renderSignIn(clusterWith({ status: 'TERMINATING' }));
		expect(screen.getByRole('heading', { name: 'Cluster Terminating' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Sign In' })).toBeNull();
		expect(instanceClient.get).not.toHaveBeenCalled();
	});

	it('treats a failed build that central manager rolled back (FAILED with terminatedAt) as terminated', async () => {
		await renderSignIn(clusterWith({ status: 'FAILED', terminatedAt: '2026-08-13T00:00:00.000Z' }));
		expect(screen.getByRole('heading', { name: 'Cluster Terminated' })).toBeTruthy();
		expect(screen.queryByLabelText('Password')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Sign In' })).toBeNull();
		expect(instanceClient.get).not.toHaveBeenCalled();
	});

	it('still offers the sign-in form for a FAILED cluster without terminatedAt, which may still be serving', async () => {
		instanceClient.get.mockResolvedValue({ data: {} });
		await renderSignIn(clusterWith({ status: 'FAILED' }));
		expect(screen.getByRole('button', { name: 'Sign In' })).toBeTruthy();
		expect(screen.queryByRole('heading', { name: 'Cluster Terminated' })).toBeNull();
		expect(instanceClient.get).toHaveBeenCalledWith('/health');
	});

	it('calls a removed self-managed cluster removed, not terminated', async () => {
		await renderSignIn(
			clusterWith({ status: 'TERMINATED', plans: [{ planId: 'self-hosted-basic' }] as Cluster['plans'] }),
		);
		expect(screen.getByRole('heading', { name: 'Cluster Removed' })).toBeTruthy();
	});

	it('still offers the sign-in form for a running cluster', async () => {
		instanceClient.get.mockResolvedValue({ data: {} });
		await renderSignIn(clusterWith({ status: 'RUNNING' }));
		expect(screen.getByLabelText('Password')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Sign In' })).toBeTruthy();
		expect(screen.queryByRole('heading', { name: 'Cluster Terminated' })).toBeNull();
		expect(instanceClient.get).toHaveBeenCalledWith('/health');
	});
});
