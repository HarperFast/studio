/**
 * @vitest-environment jsdom
 */
import { ClusterUsageCard } from '@/features/cluster/components/ClusterUsageCard';
import type {
	ClusterUsage,
	ClusterUsageRegion,
	UsageMetrics,
	UsageValue,
} from '@/integrations/api/cluster/getClusterUsage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Router Link only needs to render an anchor here.
vi.mock('@tanstack/react-router', () => ({
	Link: ({ to, children }: { to: string; children?: unknown }) => <a href={to}>{children as never}</a>,
}));

const mockUseClusterUsage = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/api/cluster/getClusterUsage', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/integrations/api/cluster/getClusterUsage')>()),
	useClusterUsage: mockUseClusterUsage,
}));

afterEach(() => {
	cleanup();
	mockUseClusterUsage.mockReset();
});

const v = (used: number, limit: number | null, over: Partial<UsageValue> = {}): UsageValue => ({
	used,
	limit,
	unlimited: false,
	limitKnown: limit !== null,
	...over,
});

const metrics = (over: Partial<UsageMetrics> = {}): UsageMetrics => ({
	reads: v(9_200_000, 10_000_000),
	readBytes: v(45e9, 54e9),
	writes: v(2_300_000, 5_000_000),
	writeBytes: v(8e9, 21e9),
	realTimeMessages: v(1_412_004, null, { unlimited: true, limitKnown: true }),
	realTimeBytes: v(6e9, null, { unlimited: true, limitKnown: true }),
	cpuTimeHours: v(1.6, 2),
	storageBytes: v(13e9, 20e9),
	...over,
});

const region = (over: Partial<ClusterUsageRegion> = {}): ClusterUsageRegion => ({
	region: 'US',
	regionIds: ['us-1'],
	planId: 'fabric-block-level-2',
	planName: 'Standard',
	planLevel: 2,
	expiresAt: '2026-08-12T00:00:00.000Z',
	status: 'active',
	activeBlockCount: 1,
	metrics: metrics(),
	rateLimits: null,
	resourcesPerInstance: null,
	...over,
});

const usage = (over: Partial<ClusterUsage> = {}): ClusterUsage => ({
	clusterId: 'clu-1',
	selfManaged: false,
	renewsAt: '2026-08-12T00:00:00.000Z',
	totals: null,
	mostConstrained: null,
	regions: [region()],
	...over,
});

function renderCard() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={client}>
			<ClusterUsageCard clusterId="clu-1" base="/org-1/clu-1" />
		</QueryClientProvider>,
	);
}

describe('ClusterUsageCard', () => {
	it('shows the four headline meters for a single-region cluster', () => {
		mockUseClusterUsage.mockReturnValue({ data: usage() });
		renderCard();
		expect(screen.getByText('Plan usage')).toBeTruthy();
		for (const label of ['Reads', 'Writes', 'Storage', 'Compute']) {
			expect(screen.getByText(label)).toBeTruthy();
		}
		// The full breakdown (e.g. the byte-volume pairs) stays on the tab.
		expect(screen.queryByText('Read data')).toBeNull();
		// The renewal date renders in the viewer's timezone, so don't pin the exact day.
		expect(screen.getByText(/^Standard plan · renews Aug \d{1,2}$/)).toBeTruthy();
	});

	it('links to the Usage tab', () => {
		mockUseClusterUsage.mockReturnValue({ data: usage() });
		renderCard();
		expect(screen.getByRole('link', { name: /View all usage/ }).getAttribute('href')).toBe('/org-1/clu-1/usage');
	});

	it('shows only the most-constrained region for a multi-region cluster', () => {
		mockUseClusterUsage.mockReturnValue({
			data: usage({
				regions: [region({ region: 'Europe' }), region(), region({ region: 'Asia Pacific' })],
				mostConstrained: {
					metric: 'reads',
					region: 'Europe',
					regionIds: ['eu-2'],
					used: 10_000_000,
					limit: 10_000_000,
					utilization: 1,
				},
			}),
		});
		renderCard();
		expect(screen.getByText('Most constrained of 3 regions')).toBeTruthy();
		expect(screen.getByText('Europe · Reads')).toBeTruthy();
		expect(screen.getByText('100%')).toBeTruthy();
		// No per-metric grid in the multi-region case.
		expect(screen.queryByText('Compute')).toBeNull();
	});

	it('falls back to a generic region label when the most-constrained region is unnamed', () => {
		mockUseClusterUsage.mockReturnValue({
			data: usage({
				regions: [region({ region: null }), region()],
				mostConstrained: {
					metric: 'reads',
					region: null,
					regionIds: ['us-1'],
					used: 5_000_000,
					limit: 10_000_000,
					utilization: 0.5,
				},
			}),
		});
		renderCard();
		expect(screen.getByText('Region · Reads')).toBeTruthy();
		// Never interpolate the raw null into a customer-facing label.
		expect(screen.queryByText(/null/)).toBeNull();
	});

	it('explains itself when a multi-region cluster has no metered ceiling', () => {
		mockUseClusterUsage.mockReturnValue({
			data: usage({ regions: [region({ region: 'Europe' }), region()], mostConstrained: null }),
		});
		renderCard();
		expect(screen.getByText(/No metered limits on the current plan/)).toBeTruthy();
	});

	it('renders nothing while loading, on error, for self-managed, or with no regions', () => {
		for (const data of [undefined, usage({ selfManaged: true, regions: [] }), usage({ regions: [] })]) {
			mockUseClusterUsage.mockReturnValue({ data });
			const { container } = renderCard();
			expect(container.textContent).toBe('');
			cleanup();
		}
	});
});
