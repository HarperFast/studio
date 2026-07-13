// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { Suspense } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// OverviewTab calls useSuspenseQuery against these query factories. Mock the
// factories to return a query that resolves synchronously so the component
// renders inside its Suspense boundary.
const mockState = vi.hoisted(() => ({ failSystemInfo: false }));

vi.mock('@/integrations/api/instance/status/getSystemInformation', () => ({
	getSystemInformationQueryOptions: () => ({
		queryKey: ['mock-system-info', mockState.failSystemInfo],
		queryFn: async () => {
			if (mockState.failSystemInfo) { throw new Error('system_information failed'); }
			return {
				system: { hostname: 'test-host', version: '4.7.0' },
				cpu: { cores: 8 },
			};
		},
	}),
}));

vi.mock('@/integrations/api/instance/status/getStatus', () => ({
	getStatusQueryOptions: () => ({
		queryKey: ['mock-get-status'],
		queryFn: async () => ({
			cluster: { mode: 'replica' },
			version: '4.7.0',
		}),
	}),
}));

import { OverviewTab } from '../OverviewTab';
import { AnalyticsTestWrapper } from './testHelpers';

const instanceParams = {
	instanceClient: { post: vi.fn() } as never,
	entityId: 'test-instance' as never,
	entityType: 'instance' as const,
};

afterEach(() => {
	cleanup();
	mockState.failSystemInfo = false;
});

describe('OverviewTab smoke', () => {
	it('renders the local system_information branch', async () => {
		const { findAllByText } = render(
			<AnalyticsTestWrapper>
				<Suspense fallback={<div>loading</div>}>
					<OverviewTab instanceParams={instanceParams} isLocalStudio />
				</Suspense>
			</AnalyticsTestWrapper>,
		);
		// First section's title from the system_information fixture is `system`.
		// `findAllByText` accommodates both the visible accordion trigger and
		// the row label inside the collapsed pane appearing in the same string.
		expect((await findAllByText(/system/i)).length).toBeGreaterThan(0);
	});

	it('renders the cloud get_status branch', async () => {
		const { findAllByText } = render(
			<AnalyticsTestWrapper>
				<Suspense fallback={<div>loading</div>}>
					<OverviewTab instanceParams={instanceParams} isLocalStudio={false} />
				</Suspense>
			</AnalyticsTestWrapper>,
		);
		expect((await findAllByText(/cluster/i)).length).toBeGreaterThan(0);
	});

	it('contains a query error in the panel error boundary instead of unmounting the tab', async () => {
		mockState.failSystemInfo = true;
		// React logs the caught error via console.error — silence it so the
		// suite output stays clean; the assertion below proves containment.
		const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const { findByText } = render(
				<AnalyticsTestWrapper>
					<Suspense fallback={<div>loading</div>}>
						<OverviewTab instanceParams={instanceParams} isLocalStudio />
					</Suspense>
				</AnalyticsTestWrapper>,
			);
			expect(await findByText(/Panel "overview" is unavailable/)).toBeTruthy();
			expect(await findByText(/system_information failed/)).toBeTruthy();
		} finally {
			errSpy.mockRestore();
		}
	});

	it('exposes a "View raw JSON" toggle', async () => {
		const { findByText } = render(
			<AnalyticsTestWrapper>
				<Suspense fallback={<div>loading</div>}>
					<OverviewTab instanceParams={instanceParams} isLocalStudio />
				</Suspense>
			</AnalyticsTestWrapper>,
		);
		expect(await findByText(/View raw JSON/i)).toBeTruthy();
	});
});
