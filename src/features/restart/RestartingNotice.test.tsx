/** @vitest-environment jsdom */
import { authStore } from '@/features/auth/store/authStore';
import { RestartingNotice } from '@/features/restart/RestartingNotice';
import { markRestarting, resetRestartTracker, syncRestartsFromCluster } from '@/lib/restart/restartTracker';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CLUSTER_ID = 'clu-123';
const ROLLING_CONTAINER_RESTART = {
	id: CLUSTER_ID,
	status: 'RESTARTING',
	instances: [{ id: 'ins-a', status: 'RUNNING' }, { id: 'ins-b', status: 'RESTARTING' }],
};

function renderNotice() {
	// No clusterId, so the notice's status poll stays off and nothing reaches the network.
	return render(
		<QueryClientProvider client={new QueryClient()}>
			<RestartingNotice entityId={CLUSTER_ID} noun="cluster" />
		</QueryClientProvider>,
	);
}

describe('RestartingNotice', () => {
	beforeEach(() => {
		resetRestartTracker();
		vi.spyOn(authStore, 'checkForBasicAuth').mockReturnValue(undefined);
		vi.spyOn(authStore, 'getOperationToken').mockReturnValue(undefined);
		vi.spyOn(authStore, 'checkForFabricConnect').mockReturnValue(false);
	});
	afterEach(() => {
		cleanup();
		resetRestartTracker();
		vi.restoreAllMocks();
	});

	it('renders nothing while the entity is not restarting', () => {
		renderNotice();
		expect(screen.queryByRole('status')).toBeNull();
	});

	it('says requests are held while the entity is down, and disappears once it is back', () => {
		const release = markRestarting([CLUSTER_ID], { reach: 'down', ttlMs: 60_000 });
		renderNotice();
		expect(screen.getByRole('status').textContent).toContain('holding its requests to this cluster');

		act(() => release());
		expect(screen.queryByRole('status')).toBeNull();
	});

	it('tells a direct connection that a rolling restart keeps the cluster available', () => {
		syncRestartsFromCluster(ROLLING_CONTAINER_RESTART);
		renderNotice();
		expect(screen.getByRole('status').textContent).toContain('stays available');
	});

	it('tells a proxied connection its requests are held, since the proxy refuses the cluster', () => {
		vi.spyOn(authStore, 'checkForFabricConnect').mockReturnValue(true);
		syncRestartsFromCluster(ROLLING_CONTAINER_RESTART);
		renderNotice();
		expect(screen.getByRole('status').textContent).toContain('holding its requests to this cluster');
	});
});
