// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../hooks/useAnalyticsRecords.ts', () => ({
	useAnalyticsRecords: vi.fn(),
}));

import { useAnalyticsRecords } from '../../hooks/useAnalyticsRecords.ts';
import { DatabaseTab } from '../DatabaseTab.tsx';
import { HealthTab } from '../HealthTab.tsx';
import { ReplicationTab } from '../ReplicationTab.tsx';
import { RequestsTab } from '../RequestsTab.tsx';
import { StorageTab } from '../StorageTab.tsx';
import { TrafficTab } from '../TrafficTab.tsx';
import { AnalyticsTestWrapper, makeRows } from './testHelpers.tsx';

const mockHook = vi.mocked(useAnalyticsRecords);

afterEach(cleanup);
beforeEach(() => mockHook.mockReset());

function happyState() {
	mockHook.mockReturnValue({
		data: makeRows(),
		isLoading: false,
		isError: false,
		error: null,
		isEmpty: false,
		fieldKeys: new Set(['count', 'mean', 'period', 'p50', 'p95', 'p99']),
		missingFields: [],
		refetch: vi.fn(),
	});
}

function loadingState() {
	mockHook.mockReturnValue({
		data: [],
		isLoading: true,
		isError: false,
		error: null,
		isEmpty: true,
		fieldKeys: new Set(),
		missingFields: [],
		refetch: vi.fn(),
	});
}

function emptyMissingFieldsState(missing: string[]) {
	mockHook.mockReturnValue({
		data: [],
		isLoading: false,
		isError: false,
		error: null,
		isEmpty: true,
		fieldKeys: new Set(),
		missingFields: missing,
		refetch: vi.fn(),
	});
}

const TABS: { name: string; Component: () => React.ReactElement }[] = [
	{ name: 'Health', Component: HealthTab },
	{ name: 'Traffic', Component: TrafficTab },
	{ name: 'Requests', Component: RequestsTab },
	{ name: 'Database', Component: DatabaseTab },
	{ name: 'Replication', Component: ReplicationTab },
	{ name: 'Storage', Component: StorageTab },
];

describe('tabs smoke', () => {
	for (const { name, Component } of TABS) {
		describe(name, () => {
			it('mounts in loading state without throwing', () => {
				loadingState();
				const { container } = render(
					<AnalyticsTestWrapper>
						<Component />
					</AnalyticsTestWrapper>,
				);
				expect(container.querySelector('[aria-label="Loading"]')).toBeTruthy();
			});

			it('mounts with happy data without throwing', () => {
				happyState();
				const { container } = render(
					<AnalyticsTestWrapper>
						<Component />
					</AnalyticsTestWrapper>,
				);
				// At least one Card title rendered
				expect(container.textContent && container.textContent.length > 0).toBe(true);
			});

			it('renders missing-field copy when schema drift is detected', () => {
				emptyMissingFieldsState(['p95']);
				const { container } = render(
					<AnalyticsTestWrapper>
						<Component />
					</AnalyticsTestWrapper>,
				);
				expect(container.textContent).toMatch(/missing required field/i);
			});
		});
	}
});
