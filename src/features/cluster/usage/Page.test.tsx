/**
 * @vitest-environment jsdom
 */
import { UsagePage } from '@/features/cluster/usage/Page';
import type {
	ClusterUsage,
	ClusterUsageRegion,
	UsageMetrics,
	UsageRateLimits,
	UsageValue,
} from '@/integrations/api/cluster/getClusterUsage';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({ useParams: () => ({ clusterId: 'clu-1' }) }));

// The page's chrome (breadcrumbs + cluster sub-nav rail) pulls in the router/query stack; the tab body
// is what's under test, so render it plainly.
vi.mock('@/features/cluster/components/ClusterContentWithSubNavMenu', () => ({
	ClusterContentWithSubNavMenu: ({ children }: { children?: unknown }) => <div>{children as never}</div>,
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

const RATE_LIMITS: UsageRateLimits = {
	readsPerMinute: 50_000,
	readsPerMinuteBytes: 34_000_000,
	writesPerMinute: 10_000,
	writesPerMinuteBytes: 5_000_000,
	realTimeDeliveriesPerMinute: 5_000,
	realTimeDeliveryBytesPerMinute: 50_000_000,
	tlsHandshakes: 1_000_000,
};

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
	rateLimits: RATE_LIMITS,
	resourcesPerInstance: { storageGb: 20, memoryMb: 4096, cpuCores: 2, threads: 4 },
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

describe('UsagePage', () => {
	it('renders every metered metric for a region', () => {
		mockUseClusterUsage.mockReturnValue({ data: usage(), isLoading: false });
		render(<UsagePage />);
		for (
			const label of [
				'Reads',
				'Read data',
				'Writes',
				'Write data',
				'Real-time messages',
				'Real-time data',
				'Compute',
				'Storage',
			]
		) {
			expect(screen.getAllByText(label).length).toBeGreaterThan(0);
		}
	});

	it('shows the region id and plan id subtly in the headers', () => {
		mockUseClusterUsage.mockReturnValue({ data: usage(), isLoading: false });
		render(<UsagePage />);
		expect(screen.getByText('us-1')).toBeTruthy();
		expect(screen.getByText('fabric-block-level-2')).toBeTruthy();
	});

	it('collapses and re-expands a region when its header is clicked', () => {
		mockUseClusterUsage.mockReturnValue({ data: usage(), isLoading: false });
		render(<UsagePage />);
		const header = screen.getByRole('button', { name: /US/ });
		expect(header.getAttribute('aria-expanded')).toBe('true');
		expect(screen.getAllByText('Compute').length).toBe(1);

		fireEvent.click(header);
		expect(header.getAttribute('aria-expanded')).toBe('false');
		expect(screen.queryByText('Compute')).toBeNull();

		fireEvent.click(header);
		expect(header.getAttribute('aria-expanded')).toBe('true');
		expect(screen.getAllByText('Compute').length).toBe(1);
	});

	it('badges an exhausted region and a lapsed one differently, and collapses lapsed by default', () => {
		mockUseClusterUsage.mockReturnValue({
			data: usage({
				regions: [
					region({ region: 'Europe', status: 'exhausted', activeBlockCount: 0 }),
					region({ region: 'Asia Pacific', regionIds: ['ap-1'], status: 'lapsed', activeBlockCount: 0 }),
				],
			}),
			isLoading: false,
		});
		render(<UsagePage />);
		expect(screen.getByText('Cycle exhausted')).toBeTruthy();
		expect(screen.getByText('No active license')).toBeTruthy();
		expect(screen.getByRole('button', { name: /Europe/ }).getAttribute('aria-expanded')).toBe('true');
		// A lapsed region has no live quota, so it starts collapsed.
		expect(screen.getByRole('button', { name: /Asia Pacific/ }).getAttribute('aria-expanded')).toBe('false');
	});

	it('hoists rate limits and per-instance resources into one shared card when uniform', () => {
		mockUseClusterUsage.mockReturnValue({
			data: usage({ regions: [region({ region: 'Europe' }), region()] }),
			isLoading: false,
		});
		render(<UsagePage />);
		expect(screen.getByRole('button', { name: /Plan limits & resources/ })).toBeTruthy();
		// Shown once, not once per region.
		expect(screen.getAllByText('Reads / minute').length).toBe(1);
		expect(screen.getAllByText('Read bandwidth / minute').length).toBe(1);
		expect(screen.getAllByText('TLS handshakes (cycle)').length).toBe(1);
	});

	it('keeps plan info per region when the regions differ', () => {
		mockUseClusterUsage.mockReturnValue({
			data: usage({
				regions: [
					region({ region: 'Europe', rateLimits: { ...RATE_LIMITS, readsPerMinute: 999 } }),
					region(),
				],
			}),
			isLoading: false,
		});
		render(<UsagePage />);
		expect(screen.queryByRole('button', { name: /Plan limits & resources/ })).toBeNull();
		expect(screen.getAllByText('Reads / minute').length).toBe(2);
	});

	it('explains the self-hosted and no-usage cases instead of rendering empty meters', () => {
		mockUseClusterUsage.mockReturnValue({ data: usage({ selfManaged: true, regions: [] }), isLoading: false });
		render(<UsagePage />);
		expect(screen.getByText(/Usage isn't tracked for self-hosted clusters/)).toBeTruthy();
		cleanup();

		mockUseClusterUsage.mockReturnValue({ data: usage({ regions: [] }), isLoading: false });
		render(<UsagePage />);
		expect(screen.getByText(/No usage has been recorded/)).toBeTruthy();
	});

	it('shows a spinner while loading', () => {
		mockUseClusterUsage.mockReturnValue({ data: undefined, isLoading: true });
		const { container } = render(<UsagePage />);
		expect(container.querySelector('.animate-spin')).toBeTruthy();
	});
});
