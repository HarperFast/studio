/**
 * @vitest-environment jsdom
 */
import { AdminClusterGrant } from '@/integrations/api/api.patch';
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BillingAdminIndex } from './index';
import { BillingCluster } from './queries/getBillingClusters';

let clusterRows: BillingCluster[] = [];
let grantRows: AdminClusterGrant[] = [];
let clustersTruncated = false;

vi.mock('./queries/getBillingClusters', () => ({
	billingClustersQueryKey: ['test-billing-clusters'],
	getBillingClustersQueryOptions: () => ({
		queryKey: ['test-billing-clusters', JSON.stringify(clusterRows.map((c) => c.id + c.status))],
		queryFn: async () => ({ clusters: clusterRows, truncated: clustersTruncated }),
		retry: false,
	}),
}));
vi.mock('@/features/admin/grants/queries/getGrants', () => ({
	getGrantsQueryOptions: () => ({
		queryKey: ['test-grants', JSON.stringify(grantRows.map((g) => g.id))],
		queryFn: async () => ({ grants: grantRows, returned: grantRows.length, truncated: false, limit: 500 }),
		retry: false,
	}),
}));
vi.mock('@/features/admin/plans/queries/getPlans', () => ({
	plansQueryKey: ['test-plans'],
	getPlansQueryOptions: () => ({
		queryKey: ['test-plans'],
		queryFn: async () => [
			{ id: 'fabric-block-hobbyist', priceUsd: 20 },
			{ id: 'fabric-block-level-1', priceUsd: 85 },
		],
		retry: false,
	}),
}));

afterEach(() => {
	cleanup();
	clustersTruncated = false;
});

const cluster = (overrides: Partial<BillingCluster> = {}): BillingCluster => ({
	id: 'clu-a',
	name: 'Alpha',
	status: 'RUNNING',
	organizationId: 'org-1',
	organizationName: 'Acme',
	plans: [{ planId: 'fabric-block-hobbyist', regionId: 'us-1' }],
	...overrides,
});

const grant = (overrides: Partial<AdminClusterGrant> = {}): AdminClusterGrant =>
	({
		id: 'cgr-a',
		clusterId: 'clu-a',
		organizationId: 'org-1',
		source: 'purchased',
		status: 'ACTIVE',
		isActive: true,
		endsAt: null,
		...overrides,
	}) as AdminClusterGrant;

async function mount(clusters: BillingCluster[], grants: AdminClusterGrant[] = []) {
	clusterRows = clusters;
	grantRows = grants;
	const result = render(
		<TestProvider>
			<BillingAdminIndex />
		</TestProvider>,
	);
	await act(() => null);
	await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
	return result;
}

const coverOf = (id: string) => screen.getByText(id).closest('tr')!.children[5].textContent;

describe('BillingAdminIndex', () => {
	// The row is the cluster, not the grant: a cluster running on nothing is the thing worth seeing,
	// and a grant-shaped list cannot show an absence.
	it('flags a running cluster with no grant', async () => {
		await mount([cluster()], []);
		expect(coverOf('clu-a')).toBe('None');
	});

	// Expected end state, not a problem — the same alarm here would train the reader to ignore it.
	it('does not flag a terminated cluster for having no grant', async () => {
		await mount([cluster({ status: 'TERMINATED' })], []);
		fireEvent.keyDown(screen.getByLabelText('Terminated clusters'), { key: 'ArrowDown' });
		await act(() => null);
		fireEvent.click(screen.getByRole('option', { name: 'Include terminated' }));
		await act(() => null);
		expect(coverOf('clu-a')).toBe('—');
	});

	// Server-computed liveness beats stored status, the same rule every other surface applies.
	it('separates a lapsed grant from a live one', async () => {
		await mount([cluster(), cluster({ id: 'clu-b', name: 'Beta' })], [
			grant(),
			grant({ id: 'cgr-b', clusterId: 'clu-b', isActive: false }),
		]);
		expect(coverOf('clu-a')).toBe('purchased');
		expect(coverOf('clu-b')).toBe('Lapsed');
	});

	it('hides terminated clusters by default', async () => {
		await mount([cluster(), cluster({ id: 'clu-gone', status: 'TERMINATED' })]);
		expect(screen.queryByText('clu-gone')).toBeNull();
		expect(screen.getByText('clu-a')).toBeTruthy();
	});

	// Price comes from the plan catalogue, summed across the cluster's region plans.
	it('totals what the cluster costs per period', async () => {
		await mount([cluster({
			plans: [{ planId: 'fabric-block-hobbyist' }, { planId: 'fabric-block-level-1' }],
		})]);
		expect(screen.getByText('clu-a').closest('tr')!.children[4].textContent).toBe('$105');
	});

	// A price built from a plan the catalogue doesn't have would be quietly short.
	it('will not total a price it cannot know', async () => {
		await mount([cluster({ plans: [{ planId: 'plan-that-is-gone' }] })]);
		expect(screen.getByText('clu-a').closest('tr')!.children[4].textContent).toBe('—');
	});

	it('says so when the fleet is larger than the sweep', async () => {
		clustersTruncated = true;
		await mount([cluster()]);
		expect(screen.getByText(/This is a partial view/)).toBeTruthy();
	});
});
