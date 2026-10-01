/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
	useParams: () => ({ organizationId: 'org-1', clusterId: 'clu-1' }),
}));
// Row chrome pulls in auth, permissions and per-instance status polling — irrelevant to the status column's content.
vi.mock('@/components/SubNavMenu', () => ({ SubNavMenu: () => null }));
vi.mock('@/features/cluster/components/ClusterPageLayout', () => ({
	ClusterPageLayout: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('./InstanceStatusCell', () => ({ InstanceStatusCell: () => null }));
vi.mock('./InstanceLogInCell', () => ({ InstanceLogInCell: () => null }));
vi.mock('./InstanceActionsMenu', () => ({ InstanceActionsMenu: () => null }));
vi.mock('./InstanceRowContextMenu', () => ({
	InstanceRowContextMenu: ({ children }: { children?: React.ReactNode }) => children,
}));

const leftoverCloneFields = { cloneExpectedGb: 40, cloneProgressGb: 40, cloneStartedAt: '2026-10-01T00:00:00Z' };
vi.mock('./queries/getClusterInfoQuery', () => ({
	getClusterInfoQueryOptions: (clusterId: string) => ({
		queryKey: [clusterId],
		queryFn: async () => ({
			id: clusterId,
			instances: [
				{ id: 'ins-1', name: 'settled', instanceFqdn: 'a.example.com', status: 'RUNNING', ...leftoverCloneFields },
				{
					id: 'ins-2',
					name: 'copying',
					instanceFqdn: 'b.example.com',
					status: 'CLONING',
					cloneExpectedGb: 40,
					cloneProgressGb: 12.4,
				},
			],
		}),
		retry: false,
		enabled: !!clusterId,
	}),
}));

import { Instances } from './Instances';

afterEach(() => {
	cleanup();
});

describe('Instances status column', () => {
	it('shows data-sync progress for a cloning instance and nothing clone-specific for a running one', async () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
		render(
			<QueryClientProvider client={client}>
				<Instances />
			</QueryClientProvider>,
		);
		const copyingRow = (await waitFor(() => screen.getByText('copying'))).closest('tr')!;
		expect(within(copyingRow).getByText('Cloning')).toBeTruthy();
		expect(within(copyingRow).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('31');
		expect(within(copyingRow).getByText('Syncing data · ~12.4 of ~40 GB (31%)')).toBeTruthy();

		const settledRow = screen.getByText('settled').closest('tr')!;
		expect(within(settledRow).getByText('Running')).toBeTruthy();
		expect(within(settledRow).queryByRole('progressbar')).toBeNull();
		expect(within(settledRow).queryByText(/Syncing data/)).toBeNull();
	});
});
