// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnalyticsContextValue } from '../context/AnalyticsContext';

// Asserts StatusTabs threads a per-instance, per-tab Recharts syncId through
// AnalyticsContext (`${entityId}:${tab}`), so crosshair sync stays scoped to
// one tab of one instance's Status page (#1454) — and that switching tabs
// changes ONLY the syncId, never the analytics window (which is baked into
// every panel's query key).

// Probe the context from inside a tab body: mock the chart tabs to a
// component that records what useAnalyticsSyncId() / useAnalyticsContext()
// resolve to.
const seenSyncIds: (string | undefined)[] = [];
const seenContexts: AnalyticsContextValue[] = [];
vi.mock('../tabs/HealthTab', async () => {
	const { useAnalyticsContext, useAnalyticsSyncId } = await import('../context/AnalyticsContext');
	function Probe() {
		seenSyncIds.push(useAnalyticsSyncId());
		seenContexts.push(useAnalyticsContext());
		return null;
	}
	return { HealthTab: Probe };
});
vi.mock('../tabs/TrafficTab', async () => {
	const { useAnalyticsContext, useAnalyticsSyncId } = await import('../context/AnalyticsContext');
	function Probe() {
		seenSyncIds.push(useAnalyticsSyncId());
		seenContexts.push(useAnalyticsContext());
		return null;
	}
	return { TrafficTab: Probe };
});

vi.mock('../hooks/useAnalyticsCapability', () => ({
	useAnalyticsCapability: () => ({
		supported: true,
		isLoading: false,
		isFetching: false,
		isAuthError: false,
		retry: vi.fn(),
	}),
}));

let currentSearch: Record<string, unknown> = {};
const navigateMock = vi.fn(async () => {});
vi.mock('@tanstack/react-router', () => ({
	useSearch: () => currentSearch,
	useNavigate: () => navigateMock,
}));

import { DEFAULT_REFRESH_MS } from '../context/timePresets';
import { StatusTabs } from '../StatusTabs';

function makeInstanceParams(entityId: string) {
	return {
		instanceClient: { post: vi.fn(async () => ({ data: [] })) } as never,
		entityId: entityId as never,
		entityType: 'instance' as const,
	};
}

function mount(entityId: string) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: 0 } },
	});
	const instanceParams = makeInstanceParams(entityId);
	const ui = () => (
		<QueryClientProvider client={client}>
			<StatusTabs instanceParams={instanceParams} isLocalStudio={false} />
		</QueryClientProvider>
	);
	const view = render(ui());
	// Fresh element, same stable props — re-renders the tree so the mocked
	// useSearch is re-read after mutating `currentSearch`.
	return { ...view, rerenderSame: () => view.rerender(ui()) };
}

beforeEach(() => {
	currentSearch = {};
	seenSyncIds.length = 0;
	seenContexts.length = 0;
	Object.defineProperty(window, 'matchMedia', {
		writable: true,
		configurable: true,
		value: vi.fn().mockImplementation((query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			addListener: vi.fn(),
			removeListener: vi.fn(),
			dispatchEvent: vi.fn(),
		})),
	});
});

afterEach(() => cleanup());

describe('StatusTabs syncId threading', () => {
	it('keys the syncId by instance and tab (default health tab)', () => {
		mount('inst-A');
		expect(seenSyncIds.length).toBeGreaterThan(0);
		expect(seenSyncIds.at(-1)).toBe('inst-A:health');
	});

	it('changes the syncId when the tab changes', () => {
		currentSearch = { tab: 'traffic' };
		mount('inst-A');
		expect(seenSyncIds.at(-1)).toBe('inst-A:traffic');
	});

	it('differs per instance so two Status pages never cross-sync', () => {
		mount('inst-A');
		const a = seenSyncIds.at(-1);
		cleanup();
		seenSyncIds.length = 0;
		mount('inst-B');
		const b = seenSyncIds.at(-1);
		expect(a).toBe('inst-A:health');
		expect(b).toBe('inst-B:health');
		expect(a).not.toBe(b);
	});
});

// Regression coverage for the tab-switch refetch bug: the window is baked
// into every panel's query key, so if switching tabs minted a new
// [start, end] snapshot, every query would re-key and defeat
// useAnalyticsRecords' staleTime-Infinity cache that makes tab flips instant.
describe('StatusTabs window stability across tab switches', () => {
	it('keeps the timeRange stable when only the tab changes', () => {
		const { rerenderSame } = mount('inst-A');
		const healthCtx = seenContexts.at(-1)!;
		expect(healthCtx.syncId).toBe('inst-A:health');

		currentSearch = { tab: 'traffic' };
		rerenderSame();
		const trafficCtx = seenContexts.at(-1)!;
		expect(trafficCtx.syncId).toBe('inst-A:traffic');
		// Same window object, not just equal values — referential stability is
		// what keeps downstream memos and query keys unchanged.
		expect(trafficCtx.timeRange).toBe(healthCtx.timeRange);
		expect(trafficCtx.bucketMs).toBe(healthCtx.bucketMs);
	});

	it('a refresh tick DOES mint a new window (same tab)', async () => {
		vi.useFakeTimers();
		try {
			mount('inst-A');
			const before = seenContexts.at(-1)!;
			await act(async () => {
				await vi.advanceTimersByTimeAsync(DEFAULT_REFRESH_MS + 5);
			});
			const after = seenContexts.at(-1)!;
			expect(after.timeRange).not.toBe(before.timeRange);
			expect(after.timeRange.endTime).toBeGreaterThanOrEqual(before.timeRange.endTime + DEFAULT_REFRESH_MS);
		} finally {
			vi.useRealTimers();
		}
	});
});
