// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../hooks/useAnalyticsRecords.ts', () => ({
	useAnalyticsRecords: vi.fn(),
}));

import { useAnalyticsRecords } from '../../hooks/useAnalyticsRecords.ts';
import { ConnectionsPanel } from '../ConnectionsPanel.tsx';
import { AnalyticsTestWrapper, makeRows } from './testHelpers.tsx';

const mockHook = vi.mocked(useAnalyticsRecords);

afterEach(cleanup);
// Braces matter: `mockReset()` returns the mock, and a function returned from
// beforeEach is treated as a cleanup hook — vitest would then invoke the mock
// itself (with no args) after each test.
beforeEach(() => {
	mockHook.mockReset();
});

type HookResult = ReturnType<typeof useAnalyticsRecords>;

function makeResult(overrides: Partial<HookResult> = {}): HookResult {
	return {
		data: [],
		isLoading: false,
		isError: false,
		error: null,
		isEmpty: true,
		fieldKeys: new Set(),
		missingFields: [],
		refetch: vi.fn(),
		...overrides,
	};
}

/** ConnectionsPanel calls useAnalyticsRecords twice (mqtt + ws); route each
 *  call to its per-metric result. */
function setHookResults(byMetric: Record<string, HookResult>) {
	mockHook.mockImplementation(({ metric }) => {
		const result = byMetric[metric];
		if (!result) { throw new Error(`unexpected metric: ${metric}`); }
		return result;
	});
	return byMetric;
}

describe('ConnectionsPanel', () => {
	it('renders a loading skeleton while either source is loading', () => {
		setHookResults({
			'mqtt-connections': makeResult({ isLoading: true }),
			'ws-connections': makeResult(),
		});
		render(
			<AnalyticsTestWrapper>
				<ConnectionsPanel />
			</AnalyticsTestWrapper>,
		);
		expect(screen.getByLabelText('Loading')).toBeTruthy();
	});

	it('renders an error with a Retry button that refetches both sources', () => {
		const results = setHookResults({
			'mqtt-connections': makeResult({ isError: true, error: new Error('mqtt down') }),
			'ws-connections': makeResult(),
		});
		render(
			<AnalyticsTestWrapper>
				<ConnectionsPanel />
			</AnalyticsTestWrapper>,
		);
		expect(screen.getByText(/Failed to load: mqtt down/)).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
		expect(results['mqtt-connections'].refetch).toHaveBeenCalledTimes(1);
		expect(results['ws-connections'].refetch).toHaveBeenCalledTimes(1);
	});

	it('renders the sessions-specific empty copy when both sources are empty', () => {
		setHookResults({
			'mqtt-connections': makeResult(),
			'ws-connections': makeResult(),
		});
		render(
			<AnalyticsTestWrapper>
				<ConnectionsPanel />
			</AnalyticsTestWrapper>,
		);
		expect(screen.getByText(/No active sessions in the selected time range/)).toBeTruthy();
	});

	it('renders the merged chart when either source has data', () => {
		setHookResults({
			'mqtt-connections': makeResult({ data: makeRows(), isEmpty: false }),
			'ws-connections': makeResult(),
		});
		const { container } = render(
			<AnalyticsTestWrapper>
				<ConnectionsPanel />
			</AnalyticsTestWrapper>,
		);
		expect(screen.getByText('Connections')).toBeTruthy();
		// Export actions appear only when there is a chart to capture.
		expect(screen.getByLabelText('Expand connections')).toBeTruthy();
		expect(container.querySelector('[aria-label="Loading"]')).toBeNull();
	});
});
