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

function mount(expectedInstances?: number) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
	return render(
		<QueryClientProvider client={client}>
			<ClusterProgress
				cluster={{ id: 'clu-1', status: 'PROVISIONING' }}
				forceProgressBarVisible={true}
				expectedInstances={expectedInstances}
			/>
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

	it('counts failed members in the width total, so the segments add up to the whole bar', async () => {
		const widths = (container: HTMLElement) =>
			['green', 'red', 'yellow', 'gray-600'].map((color) =>
				(container.querySelector(`.bg-${color}\\/80, .bg-${color}`) as HTMLElement).style.width
			);
		clusterInstances = [
			{ id: 'ins-1', planId: 'plan-1', status: 'FAILED' },
			{ id: 'ins-2', planId: 'plan-1', status: 'FAILED' },
		];
		let { container } = mount();
		await screen.findByText('2 Failed');
		expect(widths(container)).toEqual(['0%', '100%', '0%', '0%']);
		cleanup();

		clusterInstances = [
			{ id: 'ins-1', planId: 'plan-1', status: 'RUNNING' },
			{ id: 'ins-2', planId: 'plan-1', status: 'FAILED' },
		];
		({ container } = mount());
		await screen.findByText('1 Running · 1 Failed');
		expect(widths(container)).toEqual(['50%', '50%', '0%', '0%']);
	});

	it('shows instances the plans add up to but central-manager has not created yet as pending', async () => {
		clusterInstances = [
			{ id: 'ins-1', planId: 'plan-1', status: 'RUNNING' },
			{ id: 'ins-2', planId: 'plan-1', status: 'RUNNING' },
		];
		const { container } = mount(4);
		expect(await screen.findByText('2 Running · 2 Preparing')).toBeTruthy();
		expect((container.querySelector('.bg-green\\/80') as HTMLElement).style.width).toBe('50%');
		expect((container.querySelector('.bg-gray-600') as HTMLElement).style.width).toBe('50%');
	});

	it('shows members past what the plans add up to as removing, so the bar fills toward the target', async () => {
		clusterInstances = [
			{ id: 'ins-1', planId: 'plan-1', status: 'RUNNING' },
			{ id: 'ins-2', planId: 'plan-1', status: 'RUNNING' },
			{ id: 'ins-3', planId: 'plan-1', status: 'RUNNING' },
			{ id: 'ins-4', planId: 'plan-1', status: 'TERMINATED' },
		];
		const { container } = mount(2);
		expect(await screen.findByText('2 Running · 1 Removing')).toBeTruthy();
		expect((container.querySelector('.bg-green\\/80') as HTMLElement).style.width).toMatch(/^66\.66/);
		expect((container.querySelector('.bg-yellow\\/80') as HTMLElement).style.width).toMatch(/^33\.33/);
	});

	it('is all running once the scale-down reaches its target', async () => {
		clusterInstances = [
			{ id: 'ins-1', planId: 'plan-1', status: 'RUNNING' },
			{ id: 'ins-2', planId: 'plan-1', status: 'RUNNING' },
			{ id: 'ins-3', planId: 'plan-1', status: 'TERMINATED' },
		];
		mount(2);
		expect(await screen.findByText('2 Running')).toBeTruthy();
	});

	it("leaves a removed region's members draining, without also counting the staying ones as removing", async () => {
		clusterInstances = [
			{ id: 'ins-1', planId: 'plan-1', status: 'RUNNING' },
			{ id: 'ins-2', planId: 'plan-1', status: 'RUNNING' },
			{ id: 'ins-3', planId: 'plan-gone', status: 'RUNNING' },
			{ id: 'ins-4', planId: 'plan-gone', status: 'RUNNING' },
		];
		mount(2);
		expect(await screen.findByText('2 Running · 2 Draining Traffic')).toBeTruthy();
	});

	it('takes no healthy member for removing because a leaving one has failed', async () => {
		clusterInstances = [
			{ id: 'ins-1', planId: 'plan-1', status: 'RUNNING' },
			{ id: 'ins-2', planId: 'plan-1', status: 'RUNNING' },
			{ id: 'ins-3', planId: 'plan-1', status: 'FAILED' },
		];
		mount(2);
		expect(await screen.findByText('2 Running · 1 Failed')).toBeTruthy();
	});

	it("takes no healthy member for removing because a removed region's member is mid-update", async () => {
		clusterInstances = [
			{ id: 'ins-1', planId: 'plan-1', status: 'RUNNING' },
			{ id: 'ins-2', planId: 'plan-1', status: 'RUNNING' },
			{ id: 'ins-3', planId: 'plan-gone', status: 'DRAINING' },
			{ id: 'ins-4', planId: 'plan-gone', status: 'RUNNING' },
		];
		mount(2);
		await screen.findByText(/^2 Running · /);
		expect(screen.queryByText(/Removing/)).toBeNull();
	});

	it('counts nothing as removing where no target is given', async () => {
		clusterInstances = [
			{ id: 'ins-1', planId: 'plan-1', status: 'RUNNING' },
			{ id: 'ins-2', planId: 'plan-1', status: 'RUNNING' },
			{ id: 'ins-3', planId: 'plan-1', status: 'RUNNING' },
		];
		mount();
		expect(await screen.findByText('3 Running')).toBeTruthy();
	});
});
