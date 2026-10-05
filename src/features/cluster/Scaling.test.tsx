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
	Link: ({ children, to }: { children?: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
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
// The real projection always sends isActive; the belt predicate rightly demands it true, since a
// LAPSED provisional grant must read as ended, not as still applying.
let clusterGrant: { expiryPolicy: string | null; isActive?: boolean } | null = null;
let conversionState: 'APPLYING' | 'FAILED' | null = null;
let clusterInstances: Record<string, unknown>[] = [];
vi.mock('./queries/getClusterInfoQuery', () => ({
	getClusterInfoQueryOptions: (clusterId: string) => ({
		queryKey: [clusterId, clusterStatus, clusterGrant?.expiryPolicy, conversionState],
		queryFn: async () => ({
			id: clusterId,
			organizationId: 'org-1',
			status: clusterStatus,
			grant: clusterGrant,
			conversionState,
			instances: clusterInstances,
		}),
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
	conversionState = null;
	clusterInstances = [];
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
		clusterGrant = { expiryPolicy: 'conversion-pending', isActive: true };
		mount();
		await waitFor(() => screen.getByText('Here we go!'));
		expect(screen.queryByText('All done!')).toBeNull();
	});

	// The server's single failure catch marks this; the screen must not dress it as progress.
	it('shows the failure, not progress or completion, when the conversion is marked FAILED', async () => {
		clusterStatus = 'RUNNING';
		conversionState = 'FAILED';
		mount();
		await waitFor(() => screen.getByText(/did not go through/));
		expect(screen.getByText(/nothing was charged/)).toBeTruthy();
		expect(screen.queryByText('All done!')).toBeNull();
		expect(screen.queryByText('Here we go!')).toBeNull();
	});

	it('announces completion once the provisional grant has been replaced', async () => {
		clusterStatus = 'RUNNING';
		clusterGrant = { expiryPolicy: null };
		mount();
		await waitFor(() => screen.getByText('All done!'));
		expect(screen.getByText(/finished updating/)).toBeTruthy();
	});
});

describe('Scaling completion', () => {
	const runningMember = { id: 'ins-1', name: 'member-1', instanceFqdn: 'a.example.com', status: 'RUNNING' };
	const cloningMember = {
		id: 'ins-2',
		name: 'member-2',
		instanceFqdn: 'b.example.com',
		status: 'CLONING',
		cloneExpectedGb: 40,
		cloneProgressGb: 10,
	};

	it('is not done while a new member is still cloning, even though the cluster reports RUNNING', async () => {
		clusterStatus = 'RUNNING';
		clusterInstances = [runningMember, cloningMember];
		mount();
		await waitFor(() => screen.getByText('Here we go!'));
		expect(screen.queryByText('All done!')).toBeNull();
		const syncing = screen.getByRole('list', { name: 'Instances syncing data' });
		expect(syncing.textContent).toContain('member-2');
		expect(syncing.textContent).toContain('~10 of ~40 GB (25%)');
		expect(syncing.textContent).not.toContain('member-1');
	});

	it('is done once every member is running or at rest', async () => {
		clusterStatus = 'RUNNING';
		clusterInstances = [runningMember, { ...cloningMember, status: 'RUNNING' }, {
			id: 'ins-3',
			instanceFqdn: 'c.example.com',
			status: 'STOPPED',
		}];
		mount();
		await waitFor(() => screen.getByText('All done!'));
		expect(screen.queryByRole('list', { name: 'Instances syncing data' })).toBeNull();
	});
});

describe('Scaling after a failed update', () => {
	it('says the update did not finish, links the instances, and points at support rather than another update', async () => {
		clusterStatus = 'FAILED';
		mount();
		await waitFor(() => screen.getByText("Your cluster's update didn't finish"));
		expect(screen.queryByText('Here we go!')).toBeNull();
		expect(screen.getByRole('link', { name: 'View Instances' }).getAttribute('href')).toBe('/org-1/clu-1/instances');
		expect(screen.queryByRole('link', { name: /Edit/ })).toBeNull();
		expect(screen.getByText(/can't take another update/)).toBeTruthy();
	});
});
