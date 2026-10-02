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
			<ClusterProgress cluster={{ id: 'clu-1', status: 'PROVISIONING' }} forceProgressBarVisible={true} />
		</QueryClientProvider>,
	);
}

afterEach(() => {
	cleanup();
});

describe('ClusterProgress', () => {
	it('keeps counting the leader as running while it mints a clone token for a new member', async () => {
		for (const leaderStatus of ['GENERATE_TOKEN', 'TOKEN_GENERATED']) {
			clusterInstances = [
				{ id: 'ins-1', planId: 'plan-1', status: leaderStatus },
				{ id: 'ins-2', planId: 'plan-1', status: 'CLONE_PENDING' },
			];
			const { container } = mount();
			expect(await screen.findByText('1 Running · 1 Clone Pending'), leaderStatus).toBeTruthy();
			expect((container.querySelector('.bg-green\\/80') as HTMLElement).style.width, leaderStatus).toBe('50%');
			cleanup();
		}
	});

	it("counts each status on its own, not from its group's running total", async () => {
		clusterInstances = [
			{ id: 'ins-1', planId: 'plan-1', status: 'UPDATED' },
			{ id: 'ins-2', planId: 'plan-1', status: 'GENERATE_TOKEN' },
			{ id: 'ins-3', planId: 'plan-1', status: 'CLONE_READY' },
			{ id: 'ins-4', planId: 'plan-1', status: 'CLONING' },
		];
		mount();
		expect(await screen.findByText('1 Running · 1 Updated · 1 Clone Ready · 1 Cloning')).toBeTruthy();
	});
});
