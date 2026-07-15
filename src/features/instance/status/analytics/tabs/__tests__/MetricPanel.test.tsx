// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../hooks/useAnalyticsRecords', () => ({
	useAnalyticsRecords: vi.fn(),
}));

import { useAnalyticsRecords } from '../../hooks/useAnalyticsRecords';
import { MetricPanel } from '../MetricPanel';
import { AnalyticsTestWrapper, makeRows } from './testHelpers';

const mockHook = vi.mocked(useAnalyticsRecords);

afterEach(cleanup);
beforeEach(() => mockHook.mockReset());

function setHookResult(overrides: Partial<ReturnType<typeof useAnalyticsRecords>>) {
	mockHook.mockReturnValue({
		data: [],
		isLoading: false,
		isError: false,
		error: null,
		isEmpty: true,
		fieldKeys: new Set(),
		missingFields: [],
		isPlaceholderData: false,
		refetch: vi.fn(),
		...overrides,
	});
}

describe('MetricPanel', () => {
	it('renders a loading skeleton when isLoading', () => {
		setHookResult({ isLoading: true });
		render(
			<AnalyticsTestWrapper>
				<MetricPanel metric="cpu-usage" />
			</AnalyticsTestWrapper>,
		);
		expect(screen.getByLabelText('Loading')).toBeTruthy();
	});

	it('renders an error message with a Retry button when isError', () => {
		const refetch = vi.fn();
		setHookResult({ isError: true, error: new Error('boom'), refetch });
		render(
			<AnalyticsTestWrapper>
				<MetricPanel metric="cpu-usage" />
			</AnalyticsTestWrapper>,
		);
		expect(screen.getByText(/Failed to load: boom/)).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
		expect(refetch).toHaveBeenCalledTimes(1);
	});

	it('renders generic empty copy when no data and no missing fields', () => {
		setHookResult({ isEmpty: true });
		render(
			<AnalyticsTestWrapper>
				<MetricPanel metric="cpu-usage" />
			</AnalyticsTestWrapper>,
		);
		expect(screen.getByText(/No data in the selected time range/)).toBeTruthy();
	});

	it('renders explicit missing-field copy when schema drift detected', () => {
		setHookResult({ isEmpty: true, missingFields: ['p95', 'p99'] });
		render(
			<AnalyticsTestWrapper>
				<MetricPanel metric="duration" />
			</AnalyticsTestWrapper>,
		);
		expect(screen.getByText(/missing required field\(s\): p95, p99/)).toBeTruthy();
	});

	it('renders the chart body when data is available', () => {
		setHookResult({ data: makeRows(), isEmpty: false });
		const { container } = render(
			<AnalyticsTestWrapper>
				<MetricPanel metric="cpu-usage" />
			</AnalyticsTestWrapper>,
		);
		// Card title from the registered cpu-usage spec
		expect(container.textContent).toMatch(/CPU/i);
	});

	it('uses the metric id as a fallback title when neither spec nor derived registry has it', () => {
		setHookResult({ isEmpty: true });
		render(
			<AnalyticsTestWrapper>
				<MetricPanel metric="not-a-real-metric" />
			</AnalyticsTestWrapper>,
		);
		expect(screen.getByText('not-a-real-metric')).toBeTruthy();
	});
});
