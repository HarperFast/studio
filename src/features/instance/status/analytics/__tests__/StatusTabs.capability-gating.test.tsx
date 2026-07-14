// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Regression coverage for #1442: a failed get_analytics capability probe used
// to blank the WHOLE Status page — including Overview, which reads
// get_status / get_system_information and doesn't need analytics. The probe
// now gates only the chart tab bodies; the tab strip and Overview always
// render, the error notice carries a Retry button, and 401/403 get an
// auth-flavored message instead of "analytics unavailable".

vi.mock('../hooks/useAnalyticsRecords', () => ({
	useAnalyticsRecords: () => ({
		data: [],
		isLoading: false,
		isError: false,
		error: null,
		isEmpty: true,
		fieldKeys: new Set<string>(),
		missingFields: [],
		refetch: vi.fn(),
	}),
}));

// Mutable capability so each test can drive loading / error / auth states.
interface MockCapability {
	supported: boolean;
	error?: Error;
	isAuthError: boolean;
	isLoading: boolean;
	isFetching: boolean;
	retry: () => void;
}
let mockCapability: MockCapability;
vi.mock('../hooks/useAnalyticsCapability', () => ({
	useAnalyticsCapability: () => mockCapability,
}));

// Overview's real body suspends on get_status; stub it so these tests assert
// "Overview renders" without plumbing status fixtures.
vi.mock('../tabs/OverviewTab', () => ({
	OverviewTab: () => <div data-testid="overview-content">overview content</div>,
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

beforeEach(() => {
	currentSearch = {};
	navigateMock.mockClear();
	mockCapability = { supported: true, isLoading: false, isFetching: false, isAuthError: false, retry: vi.fn() };
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

import { StatusTabs } from '../StatusTabs';

const instanceParams = {
	instanceClient: { post: vi.fn(async () => ({ data: [] })) } as never,
	entityId: 'inst-A' as never,
	entityType: 'instance' as const,
};

function ui(client: QueryClient) {
	return (
		<QueryClientProvider client={client}>
			<StatusTabs instanceParams={instanceParams} isLocalStudio={false} />
		</QueryClientProvider>
	);
}

function mount() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: 0 } },
	});
	const view = render(ui(client));
	// `rerenderSame` re-renders the identical tree (e.g. after mutating
	// `currentSearch` to simulate a route change) without remounting.
	return { ...view, rerenderSame: () => view.rerender(ui(client)) };
}

afterEach(() => {
	cleanup();
});

describe('StatusTabs capability gating (#1442)', () => {
	it('still renders the Overview tab content when the capability probe errors', () => {
		mockCapability = {
			supported: false,
			error: new Error('analytics exploded'),
			isAuthError: false,
			isLoading: false,
			isFetching: false,
			retry: vi.fn(),
		};
		currentSearch = { tab: 'overview' };
		mount();

		expect(screen.getByTestId('overview-content')).toBeTruthy();
		// The tab strip stays usable — all 7 tabs are present, not an error wall.
		expect(screen.getAllByRole('tab')).toHaveLength(7);
		// Already on Overview: no redirect needed.
		expect(navigateMock).not.toHaveBeenCalled();
	});

	it('lands on Overview when the probe fails while a chart tab is selected', async () => {
		mockCapability = {
			supported: false,
			error: new Error('analytics exploded'),
			isAuthError: false,
			isLoading: false,
			isFetching: false,
			retry: vi.fn(),
		};
		currentSearch = { tab: 'health' };
		await act(async () => {
			mount();
		});

		const lastCall = navigateMock.mock.calls.at(-1)?.[0] as
			| { search?: Record<string, unknown>; replace?: boolean }
			| undefined;
		expect(lastCall?.search).toMatchObject({ tab: 'overview' });
		expect(lastCall?.replace).toBe(true);
	});

	it('does not bounce the user back to Overview when the error occurred while already on Overview', async () => {
		// Regression (cross-model review): the one-shot redirect must mark the
		// failure handled even when it lands with Overview already selected —
		// otherwise the user's FIRST click into a chart tab redirected them
		// straight back to Overview.
		mockCapability = {
			supported: false,
			error: new Error('analytics exploded'),
			isAuthError: false,
			isLoading: false,
			isFetching: false,
			retry: vi.fn(),
		};
		currentSearch = { tab: 'overview' };
		const view = mount();
		await act(async () => {});
		expect(navigateMock).not.toHaveBeenCalled();

		// User clicks into a chart tab: the route updates to ?tab=health.
		currentSearch = { tab: 'health' };
		await act(async () => {
			view.rerenderSame();
		});
		// No redirect back to Overview — the chart tab shows the notice.
		expect(navigateMock).not.toHaveBeenCalled();
		expect(screen.getByText('Analytics unavailable on this instance.')).toBeTruthy();
	});

	it('disables the Retry button and shows progress while the probe refetch is in flight', () => {
		mockCapability = {
			supported: false,
			error: new Error('analytics exploded'),
			isAuthError: false,
			isLoading: false,
			isFetching: true,
			retry: vi.fn(),
		};
		currentSearch = { tab: 'health' };
		mount();

		const button = screen.getByRole('button', { name: 'Retrying…' }) as HTMLButtonElement;
		expect(button.disabled).toBe(true);
	});

	it('shows the unavailable notice in a chart tab and the Retry button invokes retry()', () => {
		const retry = vi.fn();
		mockCapability = {
			supported: false,
			error: new Error('analytics exploded'),
			isAuthError: false,
			isLoading: false,
			isFetching: false,
			retry,
		};
		currentSearch = { tab: 'health' };
		mount();

		expect(screen.getByText('Analytics unavailable on this instance.')).toBeTruthy();
		fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
		expect(retry).toHaveBeenCalledTimes(1);
	});

	it('shows an auth-flavored message (not "unavailable") on a 401/403 probe failure', () => {
		mockCapability = {
			supported: false,
			error: new Error('Request failed with status code 401'),
			isAuthError: true,
			isLoading: false,
			isFetching: false,
			retry: vi.fn(),
		};
		currentSearch = { tab: 'health' };
		mount();

		expect(screen.getByText('Analytics request was not authorized.')).toBeTruthy();
		expect(screen.queryByText('Analytics unavailable on this instance.')).toBeNull();
		// Retry is still offered — re-auth then retry is the recovery path.
		expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
	});

	it('renders Overview immediately while the probe is still loading', () => {
		mockCapability = { supported: false, isAuthError: false, isLoading: true, isFetching: true, retry: vi.fn() };
		currentSearch = { tab: 'overview' };
		mount();

		expect(screen.getByTestId('overview-content')).toBeTruthy();
	});

	it('shows a probe-pending placeholder in chart tabs while loading', () => {
		mockCapability = { supported: false, isAuthError: false, isLoading: true, isFetching: true, retry: vi.fn() };
		currentSearch = { tab: 'health' };
		mount();

		expect(screen.getByText('Checking analytics availability…')).toBeTruthy();
		expect(navigateMock).not.toHaveBeenCalled();
	});
});
