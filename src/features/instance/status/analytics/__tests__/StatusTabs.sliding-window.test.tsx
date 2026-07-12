// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Regression coverage for the frozen-refresh-window bug (#1439): the analytics
// window is baked into every panel's query key, so auto-refresh must slide the
// window forward — re-polling a fixed [start, end] can only return stale data.
// These tests observe the windows each panel requests via the mocked records
// hook and assert the clock in StatusTabsInner advances them.

const seenWindows: { startTime: number; endTime: number }[] = [];
vi.mock('../hooks/useAnalyticsRecords.ts', () => ({
	useAnalyticsRecords: (args: { startTime: number; endTime: number }) => {
		seenWindows.push({ startTime: args.startTime, endTime: args.endTime });
		return {
			data: [],
			isLoading: false,
			isError: false,
			error: null,
			isEmpty: true,
			fieldKeys: new Set<string>(),
			missingFields: [],
			refetch: vi.fn(),
		};
	},
}));

vi.mock('../hooks/useAnalyticsCapability.ts', () => ({
	useAnalyticsCapability: () => ({
		supported: true,
		isLoading: false,
		isFetching: false,
		isAuthError: false,
		retry: vi.fn(),
	}),
}));

let currentSearch: Record<string, unknown> = {};
const navigateMock = vi.fn(async (opts: { search?: unknown }) => {
	if (typeof opts.search === 'object' && opts.search !== null) {
		currentSearch = { ...(opts.search as Record<string, unknown>) };
	} else {
		currentSearch = {};
	}
});
vi.mock('@tanstack/react-router', () => ({
	useSearch: () => currentSearch,
	useNavigate: () => navigateMock,
}));

import { DEFAULT_REFRESH_MS } from '../context/timePresets.ts';
import { StatusTabs } from '../StatusTabs.tsx';

const instanceParams = {
	instanceClient: { post: vi.fn(async () => ({ data: [] })) } as never,
	entityId: 'inst-A' as never,
	entityType: 'instance' as const,
};

function mount() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: 0 } },
	});
	return render(
		<QueryClientProvider client={client}>
			<StatusTabs instanceParams={instanceParams} isLocalStudio={false} />
		</QueryClientProvider>,
	);
}

function latestEndTime(): number {
	return Math.max(...seenWindows.map((w) => w.endTime));
}

/** Force `document.hidden` (happy-dom defaults it to false, non-configurable
 *  access goes through visibilityState — define both). */
function setDocumentHidden(hidden: boolean) {
	Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
	Object.defineProperty(document, 'visibilityState', {
		configurable: true,
		get: () => (hidden ? 'hidden' : 'visible'),
	});
}

beforeEach(() => {
	vi.useFakeTimers();
	currentSearch = {};
	seenWindows.length = 0;
	navigateMock.mockClear();
	setDocumentHidden(false);
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

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe('StatusTabs sliding refresh window', () => {
	it('advances the window by one refresh period per tick', async () => {
		mount();
		const initialEnd = latestEndTime();
		expect(initialEnd).toBeGreaterThan(0);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(DEFAULT_REFRESH_MS + 5);
		});
		const afterOneTick = latestEndTime();
		expect(afterOneTick).toBeGreaterThanOrEqual(initialEnd + DEFAULT_REFRESH_MS);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(DEFAULT_REFRESH_MS);
		});
		expect(latestEndTime()).toBeGreaterThanOrEqual(afterOneTick + DEFAULT_REFRESH_MS);
	});

	it('does not tick while auto-refresh is off (refresh=0)', async () => {
		currentSearch = { refresh: 0 };
		mount();
		const initialEnd = latestEndTime();

		await act(async () => {
			await vi.advanceTimersByTimeAsync(10 * DEFAULT_REFRESH_MS);
		});
		expect(latestEndTime()).toBe(initialEnd);
	});

	it('pauses while the browser tab is hidden and catches up once on return', async () => {
		mount();
		const initialEnd = latestEndTime();

		setDocumentHidden(true);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(2.5 * DEFAULT_REFRESH_MS);
		});
		// Hidden: interval fires but skips the refresh — window stays frozen.
		expect(latestEndTime()).toBe(initialEnd);

		setDocumentHidden(false);
		await act(async () => {
			document.dispatchEvent(new Event('visibilitychange'));
		});
		// Visible again: one catch-up tick (not one per missed period).
		const afterReturn = latestEndTime();
		expect(afterReturn).toBeGreaterThanOrEqual(initialEnd + 2 * DEFAULT_REFRESH_MS);

		// The catch-up restarts the interval, so no tick fires at the old
		// half-period-away boundary (no back-to-back burst)…
		await act(async () => {
			await vi.advanceTimersByTimeAsync(0.5 * DEFAULT_REFRESH_MS + 5);
		});
		expect(latestEndTime()).toBe(afterReturn);

		// …and the next tick fires a full period after the catch-up.
		await act(async () => {
			await vi.advanceTimersByTimeAsync(DEFAULT_REFRESH_MS);
		});
		expect(latestEndTime()).toBeGreaterThanOrEqual(afterReturn + DEFAULT_REFRESH_MS);
	});
});
