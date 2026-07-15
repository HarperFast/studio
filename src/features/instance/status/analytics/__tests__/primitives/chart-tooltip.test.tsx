// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ChartTooltip } from '../../primitives/ChartTooltip';

describe('ChartTooltip (shared cartesian chart tooltip)', () => {
	afterEach(() => cleanup());

	it('returns null when inactive', () => {
		const { container } = render(<ChartTooltip active={false} />);
		expect(container.firstChild).toBe(null);
	});

	it('returns null for an empty payload', () => {
		const { container } = render(<ChartTooltip active payload={[]} label={1700000000000} />);
		expect(container.firstChild).toBe(null);
	});

	it('formats the time header via formatTooltipTime', () => {
		const payload = [{ dataKey: 'a', name: 'A', value: 1, color: '#f00' }];
		const { container } = render(<ChartTooltip active payload={payload} label={1700000000000} formatter="count" />);
		// Nov 14 2023 in every locale's short-month rendering carries the year.
		expect(container.textContent ?? '').toMatch(/2023/);
	});

	it('formats values with the default formatter/unit', () => {
		const payload = [{ dataKey: 'a', name: 'A', value: 1500, color: '#f00' }];
		render(<ChartTooltip active payload={payload} label={1700000000000} formatter="bytes-si" unitSuffix="/s" />);
		expect(screen.getByText(/1\.5 KB\/s/)).toBeTruthy();
	});

	it('resolveEntryFormat overrides the default per entry (dual-axis charts)', () => {
		const payload = [
			{ dataKey: 'y', name: 'util', value: 0.5, color: '#f00' },
			{ dataKey: 'y', name: 'lag', value: 12, color: '#0f0' },
		];
		render(
			<ChartTooltip
				active
				payload={payload}
				label={1700000000000}
				resolveEntryFormat={(entry) => entry.name === 'util' ? { formatter: 'percent' } : { formatter: 'ms' }}
			/>,
		);
		expect(screen.getByText(/50\.0%/)).toBeTruthy();
		expect(screen.getByText(/12\.0 ms/)).toBeTruthy();
	});

	it('renders — for a missing (null) value instead of a fake 0', () => {
		const payload = [{ dataKey: 'a', name: 'A', value: null, color: '#f00' }];
		render(<ChartTooltip active payload={payload} label={1700000000000} formatter="count" />);
		expect(screen.getByText('—')).toBeTruthy();
	});

	it('shortens full node FQDNs in series names (display only)', () => {
		const node = 'hpr-us-east1-b-1.anvils.acme-inc.stage.harperfabric.com';
		const payload = [
			{ dataKey: 'y', name: `cache hits — ${node}`, value: 5, color: '#f00' },
			{ dataKey: 'y', name: node, value: 7, color: '#0f0' },
		];
		render(
			<ChartTooltip active payload={payload} label={1700000000000} formatter="count" nodeNames={[node]} />,
		);
		expect(screen.getByText('cache hits — hpr-us-east1-b-1')).toBeTruthy();
		expect(screen.getByText('hpr-us-east1-b-1')).toBeTruthy();
		expect(screen.queryByText(new RegExp('anvils'))).toBe(null);
	});

	it('disambiguates nodes whose short labels collide', () => {
		const nodes = ['node1.us.acme.com', 'node1.eu.acme.com'];
		const payload = nodes.map((n, i) => ({ dataKey: 'y', name: n, value: i, color: '#f00' }));
		render(
			<ChartTooltip active payload={payload} label={1700000000000} formatter="count" nodeNames={nodes} />,
		);
		expect(screen.getByText('node1.us')).toBeTruthy();
		expect(screen.getByText('node1.eu')).toBeTruthy();
	});

	it('renders a Total row summing the payload when showTotal is set', () => {
		const payload = [
			{ dataKey: 'a', name: 'A', value: 20, color: '#f00' },
			{ dataKey: 'b', name: 'B', value: 15, color: '#0f0' },
		];
		render(<ChartTooltip active payload={payload} label={1700000000000} formatter="count" showTotal />);
		expect(screen.getByText(/Total/)).toBeTruthy();
		expect(screen.getByText(/35/)).toBeTruthy();
	});

	it('renders no Total row without showTotal (line charts)', () => {
		const payload = [
			{ dataKey: 'a', name: 'A', value: 20, color: '#f00' },
			{ dataKey: 'b', name: 'B', value: 15, color: '#0f0' },
		];
		render(<ChartTooltip active payload={payload} label={1700000000000} formatter="count" />);
		expect(screen.queryByText(/Total/)).toBe(null);
	});

	it('suppresses the Total row for single-series payloads', () => {
		const payload = [{ dataKey: 'a', name: 'A', value: 42, color: '#f00' }];
		render(<ChartTooltip active payload={payload} label={1700000000000} formatter="count" showTotal />);
		expect(screen.queryByText(/Total/)).toBe(null);
	});

	it('uses raw count formatter for Total on count-si axis (preserve precision)', () => {
		const payload = [
			{ dataKey: 'a', name: 'A', value: 12345, color: '#f00' },
			{ dataKey: 'b', name: 'B', value: 67890, color: '#0f0' },
		];
		render(
			<ChartTooltip
				active
				payload={payload}
				label={1700000000000}
				formatter="count-si"
				unitSuffix=" msg/s"
				showTotal
			/>,
		);
		// Total = 80235; rendered raw, not "80k".
		expect(screen.getByText(/80235\s*msg\/s/)).toBeTruthy();
	});
});
