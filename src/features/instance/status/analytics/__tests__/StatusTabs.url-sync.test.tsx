// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider } from 'next-themes';
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
	useAnalyticsCapability: () => ({ supported: true, isLoading: false, retry: vi.fn() }),
}));

// next-themes uses matchMedia which jsdom doesn't have.
beforeEach(() => {
	if (!window.matchMedia) {
		Object.defineProperty(window, 'matchMedia', {
			writable: true,
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
	}
});

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
			<ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
				<StatusTabs instanceParams={instanceParams} isLocalStudio={false} />
			</ThemeProvider>
		</QueryClientProvider>,
	);
}

afterEach(() => {
	cleanup();
	window.history.replaceState(null, '', '/');
});

describe('StatusTabs URL sync', () => {
	it('reads the initial tab from the URL search param', async () => {
		window.history.replaceState(null, '', '/?tab=traffic&range=6h');
		mount();
		// The Traffic tab's TabsContent is rendered. Other tabs are mounted but
		// data-state=inactive. Look for the trigger marked active.
		await waitFor(() => {
			const trafficTrigger = screen.getAllByText('Traffic').find((el) =>
				el.getAttribute('data-state') === 'active'
				|| el.closest('[data-state="active"]') !== null
			);
			expect(trafficTrigger).toBeTruthy();
		});
	});

	it('falls back to the default tab + range when params are missing or invalid', async () => {
		window.history.replaceState(null, '', '/?tab=garbage&range=999y');
		mount();
		await waitFor(() => {
			const healthTrigger = screen.getAllByText('Health').find((el) =>
				el.getAttribute('data-state') === 'active'
				|| el.closest('[data-state="active"]') !== null
			);
			expect(healthTrigger).toBeTruthy();
		});
	});

	it('writes ?tab= and ?range= to the URL when the user changes tabs', async () => {
		window.history.replaceState(null, '', '/');
		mount();
		// Radix exposes triggers with role=tab. Native click + pointerDown is
		// what Radix actually listens for in pointerEvent-aware builds.
		const databaseTrigger = screen.getByRole('tab', { name: 'Database' });
		await act(async () => {
			fireEvent.pointerDown(databaseTrigger, { button: 0 });
			fireEvent.mouseDown(databaseTrigger, { button: 0 });
			fireEvent.click(databaseTrigger);
		});
		await waitFor(() => {
			const sp = new URLSearchParams(window.location.search);
			expect(sp.get('tab')).toBe('database');
			expect(sp.get('range')).toBe('1h');
		}, { timeout: 2000 });
	});

	it('responds to popstate so back-button navigation re-syncs state', async () => {
		window.history.replaceState(null, '', '/?tab=requests&range=24h');
		mount();
		await waitFor(() => {
			const requestsTrigger = screen.getAllByText('Requests').find((el) =>
				el.getAttribute('data-state') === 'active'
				|| el.closest('[data-state="active"]') !== null
			);
			expect(requestsTrigger).toBeTruthy();
		});
		// Simulate the user pressing the browser back button: replace the URL
		// then dispatch popstate.
		await act(async () => {
			window.history.replaceState(null, '', '/?tab=storage&range=7d');
			window.dispatchEvent(new PopStateEvent('popstate'));
		});
		await waitFor(() => {
			const storageTrigger = screen.getAllByText('Storage').find((el) =>
				el.getAttribute('data-state') === 'active'
				|| el.closest('[data-state="active"]') !== null
			);
			expect(storageTrigger).toBeTruthy();
		});
	});
});
