// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Asserts StatusTabs threads a per-instance, per-tab Recharts syncId through
// AnalyticsContext (`${entityId}:${tab}`), so crosshair sync stays scoped to
// one tab of one instance's Status page (#1454).

// Probe the context from inside a tab body: mock the chart tabs to a
// component that records what useAnalyticsSyncId() resolves to.
const seenSyncIds: (string | undefined)[] = [];
vi.mock('../tabs/HealthTab', async () => {
	const { useAnalyticsSyncId } = await import('../context/AnalyticsContext');
	function Probe() {
		seenSyncIds.push(useAnalyticsSyncId());
		return null;
	}
	return { HealthTab: Probe };
});
vi.mock('../tabs/TrafficTab', async () => {
	const { useAnalyticsSyncId } = await import('../context/AnalyticsContext');
	function Probe() {
		seenSyncIds.push(useAnalyticsSyncId());
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
	return render(
		<QueryClientProvider client={client}>
			<StatusTabs instanceParams={makeInstanceParams(entityId)} isLocalStudio={false} />
		</QueryClientProvider>,
	);
}

beforeEach(() => {
	currentSearch = {};
	seenSyncIds.length = 0;
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
