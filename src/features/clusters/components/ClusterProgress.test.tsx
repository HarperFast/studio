/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

let clusterInstances: Record<string, unknown>[] = [];
vi.mock('@/features/cluster/queries/getClusterInfoQuery', () => ({
	getClusterInfoQueryOptions: (clusterId: string | false) => ({
		queryKey: [clusterId],
		queryFn: async () => ({ id: clusterId, plans: [{ planId: 'plan-1' }], instances: clusterInstances }),
		retry: false,
		enabled: !!clusterId,
	}),
}));

import { ClusterProgress } from './ClusterProgress';

function mount() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
	return render(
		<QueryClientProvider client={client}>
			<ClusterProgress cluster={{ id: 'clu-1', status: 'UPDATING' }} forceProgressBarVisible={true} />
		</QueryClientProvider>,
	);
}

afterEach(() => {
	cleanup();
});

describe('ClusterProgress caption', () => {
	it('adds the aggregate synced percent while members are cloning', async () => {
		clusterInstances = [
			{ id: 'ins-1', planId: 'plan-1', status: 'RUNNING', cloneExpectedGb: 500, cloneProgressGb: 500 },
			{ id: 'ins-2', planId: 'plan-1', status: 'CLONING', cloneExpectedGb: 30, cloneProgressGb: 6 },
			{ id: 'ins-3', planId: 'plan-1', status: 'CLONING', cloneExpectedGb: 10, cloneProgressGb: 4 },
		];
		mount();
		expect(await screen.findByText('1 Running · 2 Cloning · ~25% synced')).toBeTruthy();
	});

	it('leaves the percent out when no cloning member has an expected size', async () => {
		clusterInstances = [
			{ id: 'ins-1', planId: 'plan-1', status: 'RUNNING' },
			{ id: 'ins-2', planId: 'plan-1', status: 'CLONING', cloneProgressGb: 6 },
		];
		mount();
		expect(await screen.findByText('1 Running · 1 Cloning')).toBeTruthy();
	});
});
