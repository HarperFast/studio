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
let usageRows: Array<Record<string, unknown>> = [];

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
vi.mock('./queries/getFleetUsage', () => ({
	fleetUsageQueryKey: ['test-fleet-usage'],
	getFleetUsageQueryOptions: () => ({
		queryKey: ['test-fleet-usage', JSON.stringify(usageRows)],
		queryFn: async () => ({
			clusters: usageRows,
			returned: usageRows.length,
			matched: usageRows.length,
			truncated: false,
			limit: 1000,
			order: 'most-constrained',
		}),
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
	usageRows = [];
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

async function mount(
	clusters: BillingCluster[],
	grants: AdminClusterGrant[] = [],
	usage: Array<Record<string, unknown>> = [],
) {
	clusterRows = clusters;
	grantRows = grants;
	usageRows = usage;
	const result = render(
		<TestProvider>
			<BillingAdminIndex />
		</TestProvider>,
	);
	await act(() => null);
	await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
	return result;
}

/** Column 0 is the expander, so the data columns start at 1. */
const cellOf = (id: string, index: number) => screen.getByText(id).closest('tr')!.children[index + 1].textContent;
const coverOf = (id: string) => cellOf(id, 6);
const usageOf = (id: string) => cellOf(id, 5);

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
		expect(cellOf('clu-a', 4)).toBe('$105');
	});

	// A price built from a plan the catalogue doesn't have would be quietly short.
	it('will not total a price it cannot know', async () => {
		await mount([cluster({ plans: [{ planId: 'plan-that-is-gone' }] })]);
		expect(cellOf('clu-a', 4)).toBe('—');
	});

	// mostConstrained is the server's single tightest region x metric. Quota is enforced per region,
	// so there is no cluster-wide percentage and deriving one here would invent a number.
	it('shows how close a cluster is to its tightest ceiling', async () => {
		await mount([cluster()], [], [{
			clusterId: 'clu-a',
			selfManaged: false,
			renewsAt: null,
			totals: null,
			regions: [],
			mostConstrained: { metric: 'reads', region: 'US', regionIds: ['us-1'], used: 900, limit: 1000, utilization: 0.9 },
		}]);
		expect(usageOf('clu-a')).toContain('90%');
	});

	// A self-hosted cluster runs under its own license, so a meter would be a fabrication.
	it('does not meter a self-hosted cluster', async () => {
		await mount([cluster()], [], [{
			clusterId: 'clu-a',
			selfManaged: true,
			renewsAt: null,
			totals: null,
			mostConstrained: null,
			regions: [],
		}]);
		expect(usageOf('clu-a')).toBe('self-hosted');
	});

	it('says so when the fleet is larger than the sweep', async () => {
		clustersTruncated = true;
		await mount([cluster()]);
		expect(screen.getByText(/This is a partial view/)).toBeTruthy();
	});
});
