// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChartCsvData } from '../../lib/csvExport';
import { PanelCard } from '../PanelShell';
import { AnalyticsTestWrapper } from './testHelpers';

afterEach(cleanup);

const csvData: ChartCsvData = {
	kind: 'series',
	data: { series: [{ key: 'a', label: 'alpha', points: [{ x: 0, y: 1 }] }] },
};

function renderCard({ canExport, getCsvData }: { canExport: boolean; getCsvData?: () => ChartCsvData | null }) {
	return render(
		<AnalyticsTestWrapper>
			<PanelCard
				title="CPU"
				description="desc"
				exportSlug="cpu-usage"
				canExport={canExport}
				renderChart={() => <div data-testid="chart-body">chart</div>}
				getCsvData={getCsvData}
			>
				<div data-testid="chart-body">chart</div>
			</PanelCard>
		</AnalyticsTestWrapper>,
	);
}

describe('PanelCard CSV button', () => {
	it('renders the CSV button in the same action row as the PNG copy/export buttons', () => {
		renderCard({ canExport: true, getCsvData: () => csvData });
		const csv = screen.getByLabelText(/Download cpu-usage as CSV/i);
		const png = screen.getByLabelText(/Download cpu-usage as PNG/i);
		const copy = screen.getByLabelText(/Copy cpu-usage chart to clipboard/i);
		expect(csv.parentElement).toBe(png.parentElement);
		expect(csv.parentElement).toBe(copy.parentElement);
	});

	it('hides the CSV button alongside the other export actions when there is nothing to export (loading/error/empty)', () => {
		renderCard({ canExport: false, getCsvData: () => csvData });
		expect(screen.queryByLabelText(/Download cpu-usage as CSV/i)).toBeNull();
		expect(screen.queryByLabelText(/Download cpu-usage as PNG/i)).toBeNull();
	});

	it('omits the CSV button when the panel supplies no getCsvData', () => {
		renderCard({ canExport: true });
		expect(screen.queryByLabelText(/Download cpu-usage as CSV/i)).toBeNull();
		// The PNG buttons still render — CSV gating is additive.
		expect(screen.getByLabelText(/Download cpu-usage as PNG/i)).toBeTruthy();
	});

	it('offers the CSV download inside the expand dialog too', () => {
		renderCard({ canExport: true, getCsvData: () => csvData });
		fireEvent.click(screen.getByLabelText(/Expand cpu-usage/i));
		// One in the (hidden-behind-dialog) header, one in the dialog.
		expect(screen.getAllByLabelText(/Download cpu-usage as CSV/i)).toHaveLength(2);
	});
});
