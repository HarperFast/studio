// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
}));

vi.mock('sonner', () => ({
	toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

import type { ChartCsvData } from '../lib/csvExport';
import { AnalyticsTestWrapper } from '../tabs/__tests__/testHelpers';
import { ChartCsvButton } from './ChartCsvButton';

afterEach(() => {
	cleanup();
	mocks.toastSuccess.mockClear();
	mocks.toastError.mockClear();
});

const seriesData: ChartCsvData = {
	kind: 'series',
	data: { series: [{ key: 'a', label: 'alpha', points: [{ x: 0, y: 1 }] }] },
};

function Harness({ getCsvData }: { getCsvData: () => ChartCsvData | null }) {
	return (
		<AnalyticsTestWrapper>
			<ChartCsvButton exportSlug="connections" getCsvData={getCsvData} />
		</AnalyticsTestWrapper>
	);
}

describe('ChartCsvButton', () => {
	it('renders an accessible label', () => {
		render(<Harness getCsvData={() => seriesData} />);
		expect(screen.getByLabelText(/Download connections as CSV/i)).toBeTruthy();
	});

	it('downloads a text/csv blob named <metric>-<start>-<end>.csv and toasts success', () => {
		// jsdom's URL.createObjectURL doesn't exist by default.
		const origCreate = URL.createObjectURL;
		const origRevoke = URL.revokeObjectURL;
		const createObjectURL = vi.fn((_obj: Blob | MediaSource) => 'blob:mock');
		URL.createObjectURL = createObjectURL;
		URL.revokeObjectURL = vi.fn();
		const clicks: Array<{ download: string }> = [];
		const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click')
			.mockImplementation(function(this: HTMLAnchorElement) {
				clicks.push({ download: this.download });
			});
		try {
			render(<Harness getCsvData={() => seriesData} />);
			fireEvent.click(screen.getByLabelText(/Download connections as CSV/i));

			expect(createObjectURL).toHaveBeenCalledTimes(1);
			const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
			expect(blob.type).toContain('text/csv');
			// AnalyticsTestWrapper's timeRange is 0 → 60_000.
			const expected = 'connections-1970-01-01T00-00-00-000Z-1970-01-01T00-01-00-000Z.csv';
			expect(clicks).toEqual([{ download: expected }]);
			expect(mocks.toastSuccess).toHaveBeenCalledWith(`Saved ${expected}`);
			expect(mocks.toastError).not.toHaveBeenCalled();
		} finally {
			clickSpy.mockRestore();
			URL.createObjectURL = origCreate;
			URL.revokeObjectURL = origRevoke;
		}
	});

	it('shows an error toast and downloads nothing when there is no data', () => {
		const origCreate = URL.createObjectURL;
		const createObjectURL = vi.fn(() => 'blob:mock');
		URL.createObjectURL = createObjectURL;
		try {
			render(<Harness getCsvData={() => null} />);
			fireEvent.click(screen.getByLabelText(/Download connections as CSV/i));
			expect(mocks.toastError).toHaveBeenCalledWith('No data to export');
			expect(createObjectURL).not.toHaveBeenCalled();
			expect(mocks.toastSuccess).not.toHaveBeenCalled();
		} finally {
			URL.createObjectURL = origCreate;
		}
	});

	it('shows an error toast when serialization throws', () => {
		render(
			<Harness
				getCsvData={() => {
					throw new Error('boom');
				}}
			/>,
		);
		fireEvent.click(screen.getByLabelText(/Download connections as CSV/i));
		expect(mocks.toastError).toHaveBeenCalledWith('Could not export CSV', { description: 'boom' });
	});
});
