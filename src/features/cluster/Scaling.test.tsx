/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stub the TanStack Router hooks so we can drive search state in tests
// without spinning up a full RouterProvider.
let currentSearch: Record<string, unknown> = {};
vi.mock('@tanstack/react-router', () => ({
	useParams: () => ({ organizationId: 'org-1', clusterId: 'clu-1' }),
	useSearch: () => currentSearch,
}));

// The page's chrome and progress widgets pull in nav/auth machinery that is
// irrelevant here — we're testing the status copy, not the layout.
vi.mock('@/features/cluster/components/ClusterContentWithSubNavMenu', () => ({
	ClusterContentWithSubNavMenu: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/features/clusters/components/ClusterProgress', () => ({
	ClusterProgress: () => null,
}));
vi.mock('@/features/clusters/components/ClusterCardAction', () => ({
	ClusterCardAction: () => null,
}));

let clusterStatus = 'UPDATING';
// The grant matters: a trial->paid conversion reaches RUNNING before the server applies the plan, so
// completion is RUNNING *plus* a grant that is no longer `conversion-pending`. Mocking the cluster
// without one made every assertion here collapse to `status === 'RUNNING'`.
let clusterGrant: { expiryPolicy: string | null } | null = null;
vi.mock('./queries/getClusterInfoQuery', () => ({
	getClusterInfoQueryOptions: (clusterId: string) => ({
		queryKey: [clusterId, clusterStatus, clusterGrant?.expiryPolicy],
		queryFn: async () => ({ id: clusterId, status: clusterStatus, grant: clusterGrant }),
		retry: false,
		enabled: !!clusterId,
	}),
}));

import { Scaling } from './Scaling';

function mount() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: 0 } },
	});
	return render(
		<QueryClientProvider client={client}>
			<Scaling />
		</QueryClientProvider>,
	);
}

beforeEach(() => {
	currentSearch = {};
	clusterStatus = 'UPDATING';
	clusterGrant = null;
});

afterEach(() => {
	cleanup();
});

describe('Scaling status copy', () => {
	it('describes the traffic-drain wait for a standard (GTM-wait) update', async () => {
		mount();
		await waitFor(() => screen.getByText('Here we go!'));
		expect(screen.getByText(/waiting several minutes to let traffic drain/)).toBeTruthy();
		expect(screen.queryByText(/immediately/)).toBeNull();
	});

	it('describes an immediate apply when the user skipped the GTM wait', async () => {
		currentSearch = { immediate: true };
		mount();
		await waitFor(() => screen.getByText('Here we go!'));
		expect(screen.getByText(/applying the latest changes immediately/)).toBeTruthy();
		expect(screen.queryByText(/traffic drain/)).toBeNull();
	});

	it('treats a stray truthy string like ?immediate=false as a standard update', async () => {
		// A hand-edited URL can leave `immediate` as a string; only an explicit true counts.
		currentSearch = { immediate: 'false' };
		mount();
		await waitFor(() => screen.getByText('Here we go!'));
		expect(screen.getByText(/waiting several minutes to let traffic drain/)).toBeTruthy();
	});

	it('accepts the string form ?immediate=true', async () => {
		currentSearch = { immediate: 'true' };
		mount();
		await waitFor(() => screen.getByText('Here we go!'));
		expect(screen.getByText(/applying the latest changes immediately/)).toBeTruthy();
	});

	it('still shows the completion state once the cluster is active again', async () => {
		clusterStatus = 'RUNNING';
		currentSearch = { immediate: true };
		mount();
		await waitFor(() => screen.getByText('All done!'));
		expect(screen.getByText(/finished updating/)).toBeTruthy();
	});

	// The server starts the cluster BEFORE applying the owed plan change, so RUNNING alone is
	// reached while the conversion is still in flight. Announcing completion there told a customer
	// their upgrade had landed when it had not.
	it('does not announce completion while a conversion is still applying', async () => {
		clusterStatus = 'RUNNING';
		clusterGrant = { expiryPolicy: 'conversion-pending' };
		mount();
		await waitFor(() => screen.getByText('Here we go!'));
		expect(screen.queryByText('All done!')).toBeNull();
	});

	it('announces completion once the provisional grant has been replaced', async () => {
		clusterStatus = 'RUNNING';
		clusterGrant = { expiryPolicy: null };
		mount();
		await waitFor(() => screen.getByText('All done!'));
		expect(screen.getByText(/finished updating/)).toBeTruthy();
	});
});
