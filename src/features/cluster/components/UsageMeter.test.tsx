/**
 * @vitest-environment jsdom
 */
import { fmtBytes, fmtCount, METERED_ORDER, toMeter, UsageMeter } from '@/features/cluster/components/UsageMeter';
import type { UsageValue } from '@/integrations/api/cluster/getClusterUsage';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(() => cleanup());

const value = (over: Partial<UsageValue> = {}): UsageValue => ({
	used: 400,
	limit: 1000,
	unlimited: false,
	limitKnown: true,
	...over,
});

// The bar is the only element carrying an inline width, so it identifies the fill.
function fillWidth(container: HTMLElement): string | undefined {
	const filled = container.querySelector<HTMLElement>('[style*="width"]');
	return filled?.style.width;
}

describe('UsageMeter', () => {
	it('renders a percentage and a proportional bar for a finite limit', () => {
		const { container } = render(<UsageMeter {...toMeter('reads', value())} />);
		expect(screen.getByText('Reads')).toBeTruthy();
		expect(screen.getByText('40%')).toBeTruthy();
		expect(fillWidth(container)).toBe('40%');
	});

	it('renders "Unlimited" with no percentage when the plan grants no ceiling', () => {
		render(<UsageMeter {...toMeter('realTimeMessages', value({ limit: null, unlimited: true }))} />);
		expect(screen.getByText('Unlimited')).toBeTruthy();
		expect(screen.queryByText(/%$/)).toBeNull();
	});

	it('renders "—" (never "Unlimited") when the plan could not be resolved', () => {
		render(<UsageMeter {...toMeter('reads', value({ limit: null, limitKnown: false }))} />);
		expect(screen.getByText('—')).toBeTruthy();
		expect(screen.queryByText('Unlimited')).toBeNull();
	});

	it('caps the bar at 100% when usage exceeds the limit', () => {
		const { container } = render(<UsageMeter {...toMeter('reads', value({ used: 1500 }))} />);
		expect(screen.getByText('100%')).toBeTruthy();
		expect(fillWidth(container)).toBe('100%');
	});

	it('treats a zero limit as unknown rather than dividing by zero', () => {
		render(<UsageMeter {...toMeter('reads', value({ used: 5, limit: 0 }))} />);
		expect(screen.getByText('—')).toBeTruthy();
		expect(screen.queryByText('NaN%')).toBeNull();
		expect(screen.queryByText('Infinity%')).toBeNull();
	});

	it('treats a negative limit as unlimited (server -1 sentinel reaching the UI unmapped)', () => {
		render(<UsageMeter {...toMeter('reads', value({ limit: -1 }))} />);
		expect(screen.getByText('Unlimited')).toBeTruthy();
	});

	it('flags a near-limit metric so it reads as a warning', () => {
		const { container } = render(<UsageMeter {...toMeter('reads', value({ used: 950 }))} />);
		expect(screen.getByText('95%')).toBeTruthy();
		expect(container.innerHTML).toContain('yellow');
	});

	it('formats counts compactly and bytes as file sizes', () => {
		expect(fmtCount(9_200_000)).toBe('9.2M');
		expect(fmtBytes(21_000_000_000)).toContain('GB');
	});

	it('covers every metric the endpoint reports, count/data pairs adjacent', () => {
		expect(METERED_ORDER).toEqual([
			'reads',
			'readBytes',
			'writes',
			'writeBytes',
			'realTimeMessages',
			'realTimeBytes',
			'cpuTimeHours',
			'storageBytes',
		]);
	});
});
