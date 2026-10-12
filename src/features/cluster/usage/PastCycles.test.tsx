/**
 * @vitest-environment jsdom
 */
import { PastCycles } from '@/features/cluster/usage/PastCycles';
import type { UsageValue } from '@/integrations/api/cluster/getClusterUsage';
import type { PastCycle, PastCycleRegion } from '@/integrations/api/cluster/getClusterUsageHistory';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockUseHistory = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/api/cluster/getClusterUsageHistory', () => ({ useClusterUsageHistory: mockUseHistory }));

afterEach(() => {
	cleanup();
	mockUseHistory.mockReset();
});

const v = (used: number, limit: number | null, over: Partial<UsageValue> = {}): UsageValue => ({
	used,
	limit,
	unlimited: false,
	limitKnown: limit !== null,
	...over,
});

const region = (over: Partial<PastCycleRegion> = {}): PastCycleRegion => ({
	region: 'US',
	regionIds: ['us-1'],
	planNames: ['Standard'],
	metrics: {
		reads: v(1_300, 2_000),
		readBytes: v(0, 100_000),
		writes: v(100, 1_000),
		writeBytes: v(0, 50_000),
		realTimeMessages: v(0, null, { unlimited: true, limitKnown: true }),
		realTimeBytes: v(0, null, { unlimited: true, limitKnown: true }),
		cpuTimeHours: v(0.5, 4),
	},
	planUsd: 100,
	overageUsd: 0,
	cycleUsd: 100,
	estimated: false,
	uninvoicedBlockCount: 0,
	topUpCount: 0,
	topUps: [],
	overageCause: null,
	stripeInvoiceIds: ['in_1'],
	...over,
});

const cycle = (over: Partial<PastCycle> = {}, regions = [region()]): PastCycle => ({
	startsAt: '2026-07-12T12:00:00.000Z',
	endsAt: '2026-08-12T12:00:00.000Z',
	planUsd: regions.reduce((sum, r) => sum + r.planUsd, 0),
	overageUsd: regions.reduce((sum, r) => sum + r.overageUsd, 0),
	cycleUsd: regions.reduce((sum, r) => sum + r.cycleUsd, 0),
	estimated: regions.some((r) => r.estimated),
	uninvoicedBlockCount: regions.reduce((sum, r) => sum + r.uninvoicedBlockCount, 0),
	stripeInvoiceIds: [],
	regions,
	...over,
});

function history(cycles: PastCycle[], over: Record<string, unknown> = {}) {
	mockUseHistory.mockReturnValue({
		data: { pages: [{ clusterId: 'clu-1', selfManaged: false, cycles, nextBefore: null, unplacedBlockCount: 0 }] },
		isLoading: false,
		hasNextPage: false,
		isFetchingNextPage: false,
		fetchNextPage: vi.fn(),
		...over,
	});
}

const card = (title: RegExp) => screen.getByRole('button', { name: title });

const WITH_OVERAGE = region({
	overageUsd: 30,
	cycleUsd: 130,
	topUpCount: 1,
	topUps: [{ createdAt: '2026-07-25T12:00:00.000Z', usedShare: 0.3, chargeUsd: 30 }],
	overageCause: { metric: 'reads', ranOutAt: '2026-07-25T12:00:00.000Z' },
});

describe('PastCycles', () => {
	it('lists ended cycles newest first, each with its dates, charges and overage', () => {
		history([
			cycle({}, [WITH_OVERAGE]),
			cycle({ startsAt: '2026-06-12T12:00:00.000Z', endsAt: '2026-07-12T12:00:00.000Z' }),
		]);
		render(<PastCycles clusterId="clu-1" />);
		const rows = screen.getAllByRole('button', { name: /2026/ });
		expect(rows.map((row) => row.textContent)).toEqual([
			expect.stringMatching(/Jul 12\s*–\s*Aug 12, 2026.*\$130\.00 in charges · \$30\.00 of it overage · US/),
			expect.stringMatching(/Jun 12\s*–\s*Jul 12, 2026.*\$100\.00 in charges · US/),
		]);
	});

	it('shows no charges for a cycle that was never billed', () => {
		history([cycle({}, [region({ planUsd: 0, cycleUsd: 0 })])]);
		render(<PastCycles clusterId="clu-1" />);
		expect(card(/Aug 12, 2026/).textContent).not.toMatch(/\$/);
		fireEvent.click(card(/Aug 12, 2026/));
		expect(screen.queryByText('Charges')).toBeNull();
	});

	it("opens to each region's meters, without storage, and what ran out and what it cost", () => {
		history([cycle({}, [WITH_OVERAGE, region({ region: 'Europe', regionIds: ['eu-1'] })])]);
		render(<PastCycles clusterId="clu-1" />);
		expect(screen.queryByText('Reads')).toBeNull();
		fireEvent.click(card(/Aug 12, 2026/));

		expect(screen.getAllByText('Reads')).toHaveLength(2);
		expect(screen.queryByText('Storage')).toBeNull();
		expect(screen.getByText(/ran out Jul 25/)).toBeTruthy();

		const charges = screen.getAllByText('Charges')[0].closest('dl') as HTMLElement;
		expect(within(charges).getByText('$130.00')).toBeTruthy();
		expect(within(charges).getByText(/Reads allowance ran out on Jul 25/)).toBeTruthy();
		expect(within(charges).getByText(/30% used/)).toBeTruthy();
		expect(within(charges).queryByText(/billed/i)).toBeNull();
	});

	it('marks an estimate, and a charge not on an invoice yet', () => {
		history([cycle({}, [region({ estimated: true, uninvoicedBlockCount: 1 })])]);
		render(<PastCycles clusterId="clu-1" />);
		expect(card(/Aug 12, 2026/).textContent).toMatch(/≈ \$100\.00 in charges/);
		fireEvent.click(card(/Aug 12, 2026/));
		expect(screen.getByText(/Estimated at the plan’s current price/)).toBeTruthy();
		expect(screen.getByText('Not on an invoice yet.')).toBeTruthy();
	});

	it('names every plan a region ran when the plan changed in the cycle', () => {
		history([cycle({}, [region({ planNames: ['Standard', 'Pro'] })])]);
		render(<PastCycles clusterId="clu-1" />);
		fireEvent.click(card(/Aug 12, 2026/));
		expect(screen.getByText('Standard → Pro plan')).toBeTruthy();
	});

	it('pages back with Show older cycles, and offers it only while there are more', () => {
		const fetchNextPage = vi.fn();
		history([cycle()], { hasNextPage: true, fetchNextPage });
		render(<PastCycles clusterId="clu-1" />);
		fireEvent.click(screen.getByRole('button', { name: 'Show older cycles' }));
		expect(fetchNextPage).toHaveBeenCalledTimes(1);

		cleanup();
		history([cycle()]);
		render(<PastCycles clusterId="clu-1" />);
		expect(screen.queryByRole('button', { name: 'Show older cycles' })).toBeNull();
	});

	it('keeps Show older cycles when a page comes back empty but older cycles remain', () => {
		history([], { hasNextPage: true });
		render(<PastCycles clusterId="clu-1" />);
		expect(screen.getByRole('button', { name: 'Show older cycles' })).toBeTruthy();
		expect(screen.queryByText('No billing cycle has ended yet.')).toBeNull();
	});

	it('names a cycle whose dates will not parse instead of failing to render', () => {
		history([cycle({ startsAt: 'garbage', endsAt: '2026-08-12T12:00:00.000Z' }), cycle({ endsAt: 'not a date' })]);
		render(<PastCycles clusterId="clu-1" />);
		expect(screen.getByRole('button', { name: /Ended Aug 12, 2026/ })).toBeTruthy();
		expect(screen.getByRole('button', { name: /Billing cycle/ })).toBeTruthy();
	});

	it('says so when no cycle has ended, and when history could not load', () => {
		history([]);
		render(<PastCycles clusterId="clu-1" />);
		expect(screen.getByText('No billing cycle has ended yet.')).toBeTruthy();

		cleanup();
		mockUseHistory.mockReturnValue({ data: undefined, isLoading: false, hasNextPage: false });
		render(<PastCycles clusterId="clu-1" />);
		expect(screen.getByText(/Couldn’t load past cycles/)).toBeTruthy();
	});
});
