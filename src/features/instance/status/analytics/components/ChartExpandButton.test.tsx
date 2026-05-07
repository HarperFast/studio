// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	toBlob: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
	toastSuccess: vi.fn(),
	toastError: vi.fn(),
}));

vi.mock('html-to-image', () => ({ toBlob: mocks.toBlob }));
vi.mock('sonner', () => ({
	toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

import { AnalyticsTestWrapper } from '../tabs/__tests__/testHelpers.tsx';
import { ChartExpandButton } from './ChartExpandButton.tsx';

afterEach(() => {
	cleanup();
	mocks.toBlob.mockClear();
	mocks.toastSuccess.mockClear();
	mocks.toastError.mockClear();
});

describe('ChartExpandButton', () => {
	it('renders an accessible expand trigger', () => {
		render(
			<AnalyticsTestWrapper>
				<ChartExpandButton
					exportSlug="cpu-usage"
					title="CPU"
					renderChart={() => <div data-testid="chart-body">chart</div>}
				/>
			</AnalyticsTestWrapper>,
		);
		expect(screen.getByLabelText(/Expand cpu-usage/i)).toBeTruthy();
	});

	it('opens a dialog with the chart re-rendered inside on click', () => {
		render(
			<AnalyticsTestWrapper>
				<ChartExpandButton
					exportSlug="cpu-usage"
					title="CPU"
					description="Per-path CPU"
					renderChart={() => <div data-testid="chart-body">chart-here</div>}
				/>
			</AnalyticsTestWrapper>,
		);
		fireEvent.click(screen.getByLabelText(/Expand cpu-usage/i));
		// Radix Dialog portals to the document — query whole document.
		expect(screen.getByText('CPU')).toBeTruthy();
		expect(screen.getByText('Per-path CPU')).toBeTruthy();
		// renderChart was invoked inside the dialog.
		expect(screen.getAllByTestId('chart-body').length).toBeGreaterThanOrEqual(1);
	});

	it('exposes its own export button inside the expanded view', () => {
		render(
			<AnalyticsTestWrapper>
				<ChartExpandButton
					exportSlug="cpu-usage"
					title="CPU"
					renderChart={() => <div data-testid="chart-body">chart</div>}
				/>
			</AnalyticsTestWrapper>,
		);
		fireEvent.click(screen.getByLabelText(/Expand cpu-usage/i));
		// Filename slug is suffixed with -expanded so a click on the export
		// button inside the dialog produces a distinct filename.
		expect(screen.getByLabelText(/Download cpu-usage-expanded as PNG/i)).toBeTruthy();
	});
});
