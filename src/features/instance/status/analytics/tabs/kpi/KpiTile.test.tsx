/** @vitest-environment jsdom */
import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { getRawAnalyticsQueryOptions } from '@/integrations/api/instance/status/getAnalytics';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AnalyticsProvider } from '../../context/AnalyticsContext';
import { useAnalyticsRecords } from '../../hooks/useAnalyticsRecords';
import { KpiSparkline } from './KpiSparkline';
import { KpiStrip } from './KpiStrip';
import { KpiTile } from './KpiTile';
import { KPI_TILES } from './kpiTiles';

// Window under test: [240s, 360s], so the previous window is [120s, 240s]
// and the label math yields "2m".
const START = 240_000;
const END = 360_000;
const BUCKET = 60_000;

const durationTile = KPI_TILES.find((t) => t.id === 'p95-duration')!;

interface PostBody {
	metric: string;
	start_time: number;
	end_time: number;
}

function makeInstanceParams(
	handler: (body: PostBody) => unknown[] | Promise<unknown[]>,
): InstanceClientIdConfig & InstanceTypeConfig {
	const post = vi.fn(async (_url: string, body: PostBody) => ({ data: await handler(body) }));
	return {
		instanceClient: { post } as never,
		entityId: 'inst-A' as never,
		entityType: 'instance',
	};
}

function makeWrapper(instanceParams: InstanceClientIdConfig & InstanceTypeConfig): {
	Wrapper: ({ children }: { children: ReactNode }) => ReactNode;
	client: QueryClient;
} {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const Wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>
			<AnalyticsProvider
				value={{
					timeRange: { startTime: START, endTime: END },
					bucketMs: BUCKET,
					instanceParams,
				}}
			>
				{children}
			</AnalyticsProvider>
		</QueryClientProvider>
	);
	return { Wrapper, client };
}

const CUR_ROWS = [
	{ time: 300_000, node: 'n1', period: 60_000, path: '/a', count: 100, p95: 10 },
	{ time: 360_000, node: 'n1', period: 60_000, path: '/a', count: 100, p95: 20 },
];
const PREV_ROWS = [
	{ time: 180_000, node: 'n1', period: 60_000, path: '/a', count: 100, p95: 10 },
];

/** Current window → CUR_ROWS, previous window → PREV_ROWS. */
function twoWindowHandler(body: PostBody): unknown[] {
	return body.start_time === START ? CUR_ROWS : PREV_ROWS;
}

describe('KpiTile', () => {
	it('renders the latest-bucket value and the delta vs the previous window', async () => {
		const params = makeInstanceParams(twoWindowHandler);
		const { Wrapper } = makeWrapper(params);
		render(<KpiTile def={durationTile} />, { wrapper: Wrapper });

		// Latest bucket p95 = 20 → "20.0 ms"; window means 15 vs 10 → +50%.
		await waitFor(() => expect(screen.getByText('20.0 ms')).toBeTruthy());
		expect(screen.getByLabelText('up +50.0% vs previous 2m')).toBeTruthy();
		expect(screen.getByText('+50.0%')).toBeTruthy();
	});

	it('shows an em-dash and no delta when data is absent', async () => {
		const params = makeInstanceParams(() => []);
		const { Wrapper } = makeWrapper(params);
		render(<KpiTile def={durationTile} />, { wrapper: Wrapper });

		await waitFor(() => expect(screen.getByText('—')).toBeTruthy());
		expect(screen.queryByText(/vs prev/)).toBeNull();
	});

	it('shows the value but no delta when only the previous window is empty', async () => {
		const params = makeInstanceParams((body) => (body.start_time === START ? CUR_ROWS : []));
		const { Wrapper } = makeWrapper(params);
		render(<KpiTile def={durationTile} />, { wrapper: Wrapper });

		await waitFor(() => expect(screen.getByText('20.0 ms')).toBeTruthy());
		expect(screen.queryByText(/vs prev/)).toBeNull();
	});

	it('renders a labeled loading skeleton while the current window is in flight', () => {
		const params = makeInstanceParams(() => new Promise<unknown[]>(() => {}));
		const { Wrapper } = makeWrapper(params);
		render(<KpiTile def={durationTile} />, { wrapper: Wrapper });

		const status = screen.getByRole('status');
		expect(status.getAttribute('aria-label')).toBe(`Loading ${durationTile.label}`);
	});

	it("keys the current window on the panels' query-key convention and the previous window on a shifted copy", async () => {
		const params = makeInstanceParams(twoWindowHandler);
		const { Wrapper, client } = makeWrapper(params);
		render(<KpiTile def={durationTile} />, { wrapper: Wrapper });
		await waitFor(() => expect(screen.getByText('20.0 ms')).toBeTruthy());

		const keys = client.getQueryCache().getAll().map((q) => JSON.stringify(q.queryKey));
		// Exactly what MetricPanel's useAnalyticsRecords would key for this
		// metric + window — byte-identical, so react-query dedupes the POST.
		const panelKey = JSON.stringify(
			getRawAnalyticsQueryOptions({
				metric: durationTile.metric,
				startTime: START,
				endTime: END,
				instanceParams: params,
				bucketMs: BUCKET,
			}).queryKey,
		);
		const previousKey = JSON.stringify(
			getRawAnalyticsQueryOptions({
				metric: durationTile.metric,
				startTime: START - (END - START),
				endTime: START,
				instanceParams: params,
				bucketMs: BUCKET,
			}).queryKey,
		);
		expect(keys).toContain(panelKey);
		expect(keys).toContain(previousKey);
		expect(panelKey).not.toBe(previousKey);
		expect(keys).toHaveLength(2);
	});

	it('dedupes the current-window POST with a mounted panel hook — one extra POST total', async () => {
		const params = makeInstanceParams(twoWindowHandler);
		const { Wrapper } = makeWrapper(params);

		// Stand-in for MetricPanel's fetch: same metric/window/bucket args
		// (requiredFields does not participate in the query key).
		function PanelProbe() {
			useAnalyticsRecords({
				metric: durationTile.metric,
				startTime: START,
				endTime: END,
				instanceParams: params,
				bucketMs: BUCKET,
				requiredFields: ['p95'],
			});
			return null;
		}

		render(
			<>
				<PanelProbe />
				<KpiTile def={durationTile} />
			</>,
			{ wrapper: Wrapper },
		);
		await waitFor(() => expect(screen.getByText('20.0 ms')).toBeTruthy());

		const post = params.instanceClient.post as unknown as ReturnType<typeof vi.fn>;
		const bodies = post.mock.calls.map((c) => c[1] as PostBody);
		// One POST for the shared current window, one for the previous window.
		expect(bodies.filter((b) => b.start_time === START && b.end_time === END)).toHaveLength(1);
		expect(bodies).toHaveLength(2);
	});
});

describe('KpiSparkline', () => {
	it('centers a flat series instead of dividing by zero', () => {
		const { container } = render(
			<KpiSparkline points={[{ x: 0, y: 5 }, { x: 100, y: 5 }]} xDomain={[0, 100]} />,
		);
		const paths = container.querySelectorAll('path');
		expect(paths.length).toBe(2);
		for (const d of [...paths].map((p) => p.getAttribute('d') ?? '')) {
			// VIEW_H / 2 = 16 for every y coordinate.
			expect(d.match(/,(\d+\.\d+)/g)?.every((m) => m === ',16.00')).toBe(true);
		}
	});

	it('renders no svg with fewer than 2 points', () => {
		const { container } = render(<KpiSparkline points={[{ x: 0, y: 5 }]} xDomain={[0, 100]} />);
		expect(container.querySelector('svg')).toBeNull();
	});
});

describe('KpiStrip', () => {
	it('renders all five tiles with identical treatment (symmetry audit)', async () => {
		const params = makeInstanceParams(() => []);
		const { Wrapper } = makeWrapper(params);
		render(<KpiStrip />, { wrapper: Wrapper });

		// Every tile resolves to the same absent-data state: em-dash, no delta.
		await waitFor(() => expect(screen.getAllByText('—')).toHaveLength(KPI_TILES.length));
		for (const def of KPI_TILES) {
			expect(screen.getByText(def.label)).toBeTruthy();
		}
		expect(screen.queryByText(/vs prev/)).toBeNull();
		// 5 metrics × (current + previous window) POSTs, nothing more.
		const post = params.instanceClient.post as unknown as ReturnType<typeof vi.fn>;
		expect(post.mock.calls).toHaveLength(KPI_TILES.length * 2);
	});
});
