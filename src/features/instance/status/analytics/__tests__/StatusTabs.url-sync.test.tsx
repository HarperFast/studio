// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock useAnalyticsRecords so we don't need a real Harper. Each tab still
// mounts; we're testing the URL-sync layer, not chart rendering.
vi.mock('../hooks/useAnalyticsRecords.ts', () => ({
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

// Capability probe must succeed so the inner StatusTabs renders (vs. the
// fallback path).
vi.mock('../hooks/useAnalyticsCapability.ts', () => ({
	useAnalyticsCapability: () => ({
		supported: true,
		isLoading: false,
		isFetching: false,
		isAuthError: false,
		retry: vi.fn(),
	}),
}));

// Stub the TanStack Router hooks so we can drive search state in tests
// without spinning up a full RouterProvider.
let currentSearch: Record<string, unknown> = {};
const navigateMock = vi.fn(async (opts: { search?: unknown }) => {
	if (opts.search === undefined) {
		currentSearch = {};
	} else if (typeof opts.search === 'object' && opts.search !== null) {
		currentSearch = { ...(opts.search as Record<string, unknown>) };
	}
});
vi.mock('@tanstack/react-router', () => ({
	useSearch: () => currentSearch,
	useNavigate: () => navigateMock,
}));

// useSystemTheme uses matchMedia which happy-dom doesn't fully implement.
beforeEach(() => {
	currentSearch = {};
	navigateMock.mockClear();
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

afterEach(() => {
	cleanup();
});

describe('StatusTabs URL sync', () => {
	it('reads the initial tab from the router search', async () => {
		currentSearch = { tab: 'traffic', range: '6h' };
		mount();
		await waitFor(() => {
			const trafficTrigger = screen.getAllByText('Traffic').find((el) =>
				el.getAttribute('data-state') === 'active'
				|| el.closest('[data-state="active"]') !== null
			);
			expect(trafficTrigger).toBeTruthy();
		});
	});

	it('falls back to the default tab + range when params are missing or invalid', async () => {
		currentSearch = { tab: 'garbage', range: '999y' };
		mount();
		await waitFor(() => {
			const healthTrigger = screen.getAllByText('Health').find((el) =>
				el.getAttribute('data-state') === 'active'
				|| el.closest('[data-state="active"]') !== null
			);
			expect(healthTrigger).toBeTruthy();
		});
	});

	it('navigates with new search when the user changes tabs', async () => {
		mount();
		const databaseTrigger = screen.getByRole('tab', { name: 'Database' });
		await act(async () => {
			fireEvent.pointerDown(databaseTrigger, { button: 0 });
			fireEvent.mouseDown(databaseTrigger, { button: 0 });
			fireEvent.click(databaseTrigger);
		});
		await waitFor(() => {
			expect(navigateMock).toHaveBeenCalled();
			const lastCall = navigateMock.mock.calls.at(-1)?.[0] as { search?: Record<string, unknown> };
			expect(lastCall?.search).toMatchObject({ tab: 'database', range: '1h' });
		}, { timeout: 2000 });
	});

	it('does not navigate on unmount (params are route-scoped, #1440)', async () => {
		// The old navigate-on-unmount cleanup fired after the destination route
		// committed and could clobber its search params; scoping now lives on
		// the route via validateSearch + stripSearchParams.
		currentSearch = { tab: 'requests', range: '24h' };
		const { unmount } = mount();
		await waitFor(() => {
			const requestsTrigger = screen.getAllByText('Requests').find((el) =>
				el.getAttribute('data-state') === 'active'
				|| el.closest('[data-state="active"]') !== null
			);
			expect(requestsTrigger).toBeTruthy();
		});
		navigateMock.mockClear();
		unmount();
		expect(navigateMock).not.toHaveBeenCalled();
	});
});
