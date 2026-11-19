/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
	Link: ({ to, children }: { to: string; children?: React.ReactNode }) => <a href={to}>{children}</a>,
	Navigate: ({ to }: { to: string }) => <div>redirected to {to}</div>,
	useParams: () => ({ organizationId: 'org-1', clusterId: 'clu-1' }),
	useRouter: () => ({ navigate: vi.fn() }),
}));
vi.mock('@/components/NestedContentWithSubNavMenu', () => ({
	NestedContentWithSubNavMenu: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/features/clusters/components/ClusterProgress', () => ({ ClusterProgress: () => null }));
vi.mock('@/features/clusters/components/ClusterCardAction', () => ({ ClusterCardAction: () => null }));
vi.mock('@/hooks/useLocalStorage', () => ({ useLocalStorage: () => [null, vi.fn()] }));

let respond: () => Promise<unknown>;
vi.mock('./queries/getClusterInfoQuery', () => ({
	getClusterInfoQueryOptions: (clusterId: string) => ({
		queryKey: [clusterId],
		queryFn: () => respond(),
		retry: false,
		enabled: !!clusterId,
	}),
}));

import { StartingUp } from './StartingUp';

function mount() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
	return render(
		<QueryClientProvider client={client}>
			<StartingUp />
		</QueryClientProvider>,
	);
}

afterEach(() => {
	cleanup();
});

describe('StartingUp', () => {
	it('lists each instance still syncing under the build progress', async () => {
		respond = async () => ({
			id: 'clu-1',
			organizationId: 'org-1',
			status: 'PROVISIONING',
			instances: [{ id: 'ins-1', name: 'node-a', instanceFqdn: 'a.example.com', status: 'CLONE_PENDING' }],
		});
		mount();
		await waitFor(() => screen.getByText('Here we go!'));
		expect(screen.getByText('Waiting to sync data')).toBeTruthy();
	});

	it('says a terminated cluster is gone instead of waiting on it to start', async () => {
		respond = async () => ({
			id: 'clu-1',
			name: 'prod-east',
			organizationId: 'org-1',
			status: 'TERMINATED',
			instances: [],
		});
		mount();
		await waitFor(() => screen.getByRole('heading', { name: 'Cluster Terminated' }));
		expect(screen.queryByText('Here we go!')).toBeNull();
	});

	it('still offers Try Again for a failed build central manager rolled back (FAILED with terminatedAt)', async () => {
		respond = async () => ({
			id: 'clu-1',
			organizationId: 'org-1',
			status: 'FAILED',
			terminatedAt: '2026-10-12T00:00:00.000Z',
			instances: [],
		});
		mount();
		await waitFor(() => screen.getByRole('button', { name: 'Try Again' }));
		expect(screen.queryByRole('heading', { name: 'Cluster Terminated' })).toBeNull();
	});

	it('sends a stopped cluster whose start is refused to its overview instead of promising it is spinning up', async () => {
		respond = async () => ({
			id: 'clu-1',
			organizationId: 'org-1',
			status: 'STOPPED',
			resetPassword: true,
			suspendedReason: 'PAYMENT_FAILED',
			grant: { isActive: true, source: 'purchased' },
			instances: [],
		});
		mount();
		await waitFor(() => screen.getByText('redirected to /org-1/clu-1'));
		expect(screen.queryByText('Here we go!')).toBeNull();
	});
});
