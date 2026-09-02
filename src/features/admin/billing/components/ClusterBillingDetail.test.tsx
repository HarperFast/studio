/**
 * @vitest-environment jsdom
 */
import { FleetUsageCluster } from '@/features/admin/billing/queries/getFleetUsage';
import { ClusterUsageRegion, UsageValue } from '@/integrations/api/cluster/getClusterUsage';
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClusterBillingDetail } from './ClusterBillingDetail';

vi.mock('@/features/admin/billing/queries/getClusterInvoices', () => ({
	getClusterInvoicesQueryOptions: (organizationId: string, enabled: boolean) => ({
		queryKey: ['test-invoices', organizationId],
		queryFn: async () => ({ invoices: [], unavailable: true }),
		enabled,
		retry: false,
	}),
}));

afterEach(cleanup);

const value: UsageValue = { used: 0, limit: 100, unlimited: false, limitKnown: true };
const metrics = Object.fromEntries(
	['reads', 'readBytes', 'writes', 'writeBytes', 'realTimeMessages', 'realTimeBytes', 'cpuTimeHours', 'storageBytes']
		.map((k) => [k, value]),
) as unknown as ClusterUsageRegion['metrics'];

function region(overrides: Partial<ClusterUsageRegion>): ClusterUsageRegion {
	return {
		region: 'Global',
		regionIds: ['global-1'],
		planId: 'fabric-block-level-1',
		planName: null,
		planLevel: null,
		expiresAt: null,
		status: 'active',
		activeBlockCount: 1,
		metrics,
		rateLimits: null,
		resourcesPerInstance: null,
		stripeInvoiceIds: [],
		nonBillableBlockCount: 0,
		uninvoicedBlockCount: 0,
		...overrides,
	};
}

async function mount(r: ClusterUsageRegion) {
	const usage = {
		clusterId: 'clu-a',
		organizationId: 'org-1',
		name: 'Alpha',
		status: 'RUNNING',
		selfManaged: false,
		renewsAt: null,
		totals: null,
		mostConstrained: null,
		regions: [r],
	} as FleetUsageCluster;
	const result = render(
		<TestProvider>
			<ClusterBillingDetail usage={usage} organizationId="org-1" />
		</TestProvider>,
	);
	// Two passes: one to render, one for the invoice query to settle off its microtask.
	await act(() => null);
	await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
	return result;
}

// The three states come from the per-block record, never from the cluster's current grant: a block's
// stamp says what covered it THEN, which is the only thing that can tell "never" from "not yet".
describe('ClusterBillingDetail invoice state', () => {
	it('says a non-billable history was never invoiced, not that it is pending', async () => {
		await mount(region({ nonBillableBlockCount: 2 }));
		expect(screen.getByText(/2 blocks billed offline or complimentary/)).toBeTruthy();
		expect(screen.queryByText(/awaiting invoice/)).toBeNull();
	});

	it('says a billable block with no invoice is pending', async () => {
		await mount(region({ uninvoicedBlockCount: 1 }));
		expect(screen.getByText(/1 block awaiting invoice/)).toBeTruthy();
		expect(screen.queryByText(/billed offline/)).toBeNull();
	});

	// A cluster converted to paid part-way through has both; picking one would misreport the other.
	it('shows both for a mixed history rather than choosing', async () => {
		await mount(region({ nonBillableBlockCount: 1, uninvoicedBlockCount: 1 }));
		expect(screen.getByText(/1 block billed offline/)).toBeTruthy();
		expect(screen.getByText(/1 block awaiting invoice/)).toBeTruthy();
		expect(screen.getByText(/converted to paid part-way through/)).toBeTruthy();
	});

	it('says nothing extra when every block is invoiced', async () => {
		await mount(region({ stripeInvoiceIds: ['in_1'] }));
		expect(screen.queryByText(/billed offline/)).toBeNull();
		expect(screen.queryByText(/awaiting invoice/)).toBeNull();
		expect(screen.getByText('in_1')).toBeTruthy();
	});
});
