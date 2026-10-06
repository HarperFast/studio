/**
 * @vitest-environment jsdom
 */
import { UsagePage } from '@/features/cluster/usage/Page';
import type {
	ClusterUsage,
	ClusterUsageRegion,
	UsageMetrics,
	UsageRateLimit,
	UsageRateLimits,
	UsageValue,
} from '@/integrations/api/cluster/getClusterUsage';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({ useParams: () => ({ clusterId: 'clu-1' }) }));
vi.mock('@/features/cluster/queries/getClusterInfoQuery', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useClusterInfo: () => ({ data: undefined }),
}));

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

const rate = (limit: number | null, over: Partial<UsageRateLimit> = {}): UsageRateLimit => ({
	limit,
	unlimited: false,
	limitKnown: limit !== null,
	...over,
});

const RATE_LIMITS: UsageRateLimits = {
	readsPerMinute: rate(50_000),
	readsPerMinuteBytes: rate(34_000_000),
	writesPerMinute: rate(10_000),
	writesPerMinuteBytes: rate(5_000_000),
	realTimeDeliveriesPerMinute: rate(5_000),
	realTimeDeliveryBytesPerMinute: rate(50_000_000),
	tlsHandshakes: rate(1_000_000),
};

// The value cell of a "Plan limits & resources" row, found via its label.
const rowValue = (label: string) => screen.getByText(label).parentElement?.textContent?.replace(label, '');

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
					region({ region: 'Europe', rateLimits: { ...RATE_LIMITS, readsPerMinute: rate(999) } }),
					region(),
				],
			}),
			isLoading: false,
		});
		render(<UsagePage />);
		expect(screen.queryByRole('button', { name: /Plan limits & resources/ })).toBeNull();
		expect(screen.getAllByText('Reads / minute').length).toBe(2);
	});

	it('renders the effective ceiling the endpoint reports', () => {
		// Already scaled to the region's distribution tier server-side — the page states it verbatim.
		mockUseClusterUsage.mockReturnValue({ data: usage(), isLoading: false });
		render(<UsagePage />);
		expect(rowValue('Reads / minute')).toBe('50,000');
	});

	it('takes a metered value through the ceiling formatter unchanged — one vocabulary, not two', () => {
		// A UsageValue is a rate ceiling plus `used`, so it satisfies UsageRateLimit: this assignment
		// type-checks, and the same formatter renders it. Guards the shared shape against drifting apart.
		const metered: UsageValue = v(9_200_000, 50_000);
		mockUseClusterUsage.mockReturnValue({
			data: usage({ regions: [region({ rateLimits: { ...RATE_LIMITS, readsPerMinute: metered } })] }),
			isLoading: false,
		});
		render(<UsagePage />);
		expect(rowValue('Reads / minute')).toBe('50,000');
	});

	it('reads a plan with no ceiling as Unlimited, never as the -1 sentinel', () => {
		// fabric-block-dedicated-unlimited-{2..5} store -1 for every limit.
		mockUseClusterUsage.mockReturnValue({
			data: usage({
				regions: [
					region({ rateLimits: { ...RATE_LIMITS, readsPerMinute: rate(null, { unlimited: true, limitKnown: true }) } }),
				],
			}),
			isLoading: false,
		});
		render(<UsagePage />);
		expect(rowValue('Reads / minute')).toBe('Unlimited');
		expect(screen.queryByText('-1')).toBeNull();
	});

	it('shows "—" for a ceiling the endpoint could not determine', () => {
		mockUseClusterUsage.mockReturnValue({
			data: usage({ regions: [region({ rateLimits: { ...RATE_LIMITS, readsPerMinute: rate(null) } })] }),
			isLoading: false,
		});
		render(<UsagePage />);
		expect(rowValue('Reads / minute')).toBe('—');
	});

	it('drops a ceiling the plan does not declare rather than inventing one', () => {
		mockUseClusterUsage.mockReturnValue({
			data: usage({ regions: [region({ rateLimits: { ...RATE_LIMITS, readsPerMinute: null } })] }),
			isLoading: false,
		});
		render(<UsagePage />);
		expect(screen.queryByText('Reads / minute')).toBeNull();
		expect(screen.getByText('Writes / minute')).toBeTruthy();
	});

	it('will not state a bare per-block number from a pre-normalization server as the regional ceiling', () => {
		// Deploy-order guard: an older central-manager sends raw plan values here. Understating a ceiling
		// reads as a real, lower limit, so an un-normalized value must degrade to "—" instead.
		mockUseClusterUsage.mockReturnValue({
			data: usage({
				regions: [region({
					rateLimits: { ...RATE_LIMITS, readsPerMinute: 50_000 as unknown as UsageRateLimit },
				})],
			}),
			isLoading: false,
		});
		render(<UsagePage />);
		expect(rowValue('Reads / minute')).toBe('—');
	});

	it('drops a non-positive per-instance resource instead of rendering a sentinel', () => {
		mockUseClusterUsage.mockReturnValue({
			data: usage({
				regions: [region({ resourcesPerInstance: { storageGb: -1, memoryMb: 4096, cpuCores: 2, threads: 4 } })],
			}),
			isLoading: false,
		});
		render(<UsagePage />);
		expect(screen.queryByText('Storage', { selector: 'dt' })).toBeNull();
		expect(rowValue('Memory')).toBe('4 GB');
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

	it('distinguishes a failed fetch from an empty cycle', () => {
		mockUseClusterUsage.mockReturnValue({ data: undefined, isLoading: false, isError: true });
		render(<UsagePage />);
		expect(screen.getByRole('alert').textContent).toMatch(/Couldn't load usage data/);
		// "No usage recorded" on a billing surface would read as a zero bill.
		expect(screen.queryByText(/No usage has been recorded/)).toBeNull();
	});

	it('also flags the paused-retry case, where isLoading and isError are both false', () => {
		// react-query parks an offline retry at pending/paused, so neither flag is set and there's
		// no data — reached against stage by failing the request. Must not read as an empty cycle.
		mockUseClusterUsage.mockReturnValue({ data: undefined, isLoading: false, isError: false });
		render(<UsagePage />);
		expect(screen.getByRole('alert').textContent).toMatch(/Couldn't load usage data/);
		expect(screen.queryByText(/No usage has been recorded/)).toBeNull();
	});

	it('still calls an actually-empty cycle empty', () => {
		// Data arrived and genuinely reports no regions — that IS "nothing used yet", not a failure.
		mockUseClusterUsage.mockReturnValue({ data: usage({ regions: [] }), isLoading: false });
		render(<UsagePage />);
		expect(screen.getByText(/No usage has been recorded/)).toBeTruthy();
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('keeps showing cached usage when a background refetch fails', () => {
		mockUseClusterUsage.mockReturnValue({ data: usage(), isLoading: false, isError: true });
		render(<UsagePage />);
		expect(screen.queryByRole('alert')).toBeNull();
		expect(screen.getAllByText('Compute').length).toBe(1);
	});

	it('shows a spinner while loading', () => {
		mockUseClusterUsage.mockReturnValue({ data: undefined, isLoading: true });
		const { container } = render(<UsagePage />);
		expect(container.querySelector('.animate-spin')).toBeTruthy();
	});
});

describe('UsagePage — what the cycle costs so far', () => {
	const billed = (over: Partial<ClusterUsageRegion> = {}) =>
		region({
			planUsd: 500,
			overageUsd: 85,
			cycleUsd: 585,
			topUpCount: 2,
			overageSince: '2026-07-10T12:00:00.000Z',
			...over,
		});
	const clusterTotal = () => screen.queryByRole('region', { name: 'This cycle so far' });
	// The breakdown is a <dl>: the amount sits in the <dd> beside its label.
	const amountBeside = (label: string) => screen.getByText(label).nextElementSibling?.textContent;

	it('shows the total with the plan and the overage broken out, and when the overage is billed', () => {
		mockUseClusterUsage.mockReturnValue({ data: usage({ regions: [billed()] }), isLoading: false });
		render(<UsagePage />);
		expect(amountBeside('This cycle so far')).toBe('$585.00');
		expect(amountBeside('Plan')).toBe('$500.00');
		expect(amountBeside('Overage')).toBe('$85.00');
		// Dates render in the viewer's timezone, so the day is not pinned.
		expect(screen.getByText(/^2 top-ups since Jul \d{1,2} · billed at renewal on Aug \d{1,2}$/)).toBeTruthy();
	});

	it('shows no overage line before the block runs out', () => {
		mockUseClusterUsage.mockReturnValue({
			data: usage({ regions: [billed({ overageUsd: 0, cycleUsd: 500, topUpCount: 0, overageSince: null })] }),
			isLoading: false,
		});
		render(<UsagePage />);
		expect(amountBeside('This cycle so far')).toBe('$500.00');
		expect(screen.queryByText('Overage')).toBeNull();
	});

	it.each([
		['a region that is never billed (comped, contracted, trial)', {
			planUsd: 0,
			overageUsd: 0,
			cycleUsd: 0,
			topUpCount: 1,
		}],
		['a server that predates the amounts', {}],
	])('shows no dollars for %s', (_why, over) => {
		mockUseClusterUsage.mockReturnValue({ data: usage({ regions: [region(over)] }), isLoading: false });
		render(<UsagePage />);
		expect(screen.queryByText('This cycle so far')).toBeNull();
		expect(screen.queryByText(/\$/)).toBeNull();
	});

	it("adds the cluster's total under the heading only across several regions", () => {
		mockUseClusterUsage.mockReturnValue({
			data: usage({ regions: [billed()], planUsd: 500, overageUsd: 85, cycleUsd: 585 }),
			isLoading: false,
		});
		render(<UsagePage />);
		expect(clusterTotal()).toBeNull();
		cleanup();

		mockUseClusterUsage.mockReturnValue({
			data: usage({
				regions: [billed(), billed({ region: 'Europe', regionIds: ['eu-1'] })],
				planUsd: 1000,
				overageUsd: 170,
				cycleUsd: 1170,
			}),
			isLoading: false,
		});
		render(<UsagePage />);
		const total = within(clusterTotal()!);
		expect(total.getByText('$1,170.00')).toBeTruthy();
		expect(total.getByText('$1,000.00 plan + $170.00 overage, billed at renewal')).toBeTruthy();
	});

	it('states what removed regions still owe instead of saying nothing was used', () => {
		mockUseClusterUsage.mockReturnValue({
			data: usage({ regions: [], planUsd: 0, overageUsd: 85, cycleUsd: 85 }),
			isLoading: false,
		});
		render(<UsagePage />);
		expect(screen.getByText('No region is running now; $85.00 this cycle so far, $85.00 of it overage.')).toBeTruthy();
		expect(screen.queryByText(/No usage has been recorded/)).toBeNull();
	});

	it('adds the total when a removed region still owes overage the listed one does not show', () => {
		mockUseClusterUsage.mockReturnValue({
			data: usage({
				regions: [billed({ overageUsd: 0, cycleUsd: 500, topUpCount: 0, overageSince: null })],
				planUsd: 500,
				overageUsd: 85,
				cycleUsd: 585,
			}),
			isLoading: false,
		});
		render(<UsagePage />);
		const total = within(clusterTotal()!);
		expect(total.getByText('$585.00')).toBeTruthy();
		expect(total.getByText('$500.00 plan + $85.00 overage, billed at renewal')).toBeTruthy();
	});
});

describe('UsagePage — what the overage is and what caused it', () => {
	const explained = (over: Partial<ClusterUsageRegion> = {}) =>
		region({
			planUsd: 500,
			overageUsd: 127.5,
			cycleUsd: 627.5,
			topUpCount: 3,
			overageSince: '2026-07-10T12:00:00.000Z',
			overageCause: { metric: 'reads', ranOutAt: '2026-07-10T12:00:00.000Z' },
			topUps: [
				{ createdAt: '2026-07-10T12:00:00.000Z', usedShare: 1, chargeUsd: 85 },
				{ createdAt: '2026-07-20T12:00:00.000Z', usedShare: 0.5, chargeUsd: 42.5 },
				{ createdAt: '2026-07-25T12:00:00.000Z', usedShare: 0, chargeUsd: 0 },
			],
			...over,
		});
	const lines = () =>
		within(screen.getByRole('list', { name: 'Extra capacity' })).getAllByRole('listitem').map((item) =>
			item.textContent
		);

	it('says which allowance ran out and when, and how the extra capacity is charged', () => {
		mockUseClusterUsage.mockReturnValue({ data: usage({ regions: [explained()] }), isLoading: false });
		render(<UsagePage />);
		// Dates render in the viewer's timezone, so the day is not pinned.
		expect(
			screen.getByText(
				/^Your plan.s Reads allowance ran out on Jul \d{1,2}\. Your cluster kept running on extra capacity, charged at your plan.s rate for the share of it you use, and billed at renewal on Aug \d{1,2}\.$/,
			),
		).toBeTruthy();
	});

	it('lists each block of extra capacity with how much of it was used and what it cost', () => {
		mockUseClusterUsage.mockReturnValue({ data: usage({ regions: [explained()] }), isLoading: false });
		render(<UsagePage />);
		const listed = lines();
		expect(listed).toHaveLength(3);
		expect(listed[0]).toMatch(/^Jul \d{1,2} · extra capacity, fully used\$85\.00$/);
		expect(listed[1]).toMatch(/^Jul \d{1,2} · extra capacity, 50% used\$42\.50$/);
		expect(listed[2]).toMatch(/^Jul \d{1,2} · extra capacity, not used\$0\.00$/);
	});

	it('flags the meter that ran out', () => {
		mockUseClusterUsage.mockReturnValue({ data: usage({ regions: [explained()] }), isLoading: false });
		render(<UsagePage />);
		const flag = screen.getByText(/^ran out Jul \d{1,2}$/);
		expect(flag.parentElement?.textContent).toMatch(/^Reads/);
		expect(screen.getAllByText(/^ran out /)).toHaveLength(1);
	});

	it('still explains the overage when the meter is not known', () => {
		mockUseClusterUsage.mockReturnValue({
			data: usage({ regions: [explained({ overageCause: { metric: null, ranOutAt: '2026-07-10T12:00:00.000Z' } })] }),
			isLoading: false,
		});
		render(<UsagePage />);
		expect(screen.getByText(/^Your plan.s allowance ran out on Jul \d{1,2}\./)).toBeTruthy();
		expect(screen.queryByText(/^ran out /)).toBeNull();
	});
});
