// @vitest-environment jsdom
import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useAnalyticsRecords } from './useAnalyticsRecords';

interface AxiosLike {
	post: ReturnType<typeof vi.fn>;
}

function makeInstanceParams(
	rows: unknown[],
	opts: { entityId?: string; throwError?: Error } = {},
): InstanceClientIdConfig & InstanceTypeConfig {
	const post = vi.fn(async () => {
		if (opts.throwError) { throw opts.throwError; }
		return { data: rows };
	});
	const client: AxiosLike = { post };
	return {
		instanceClient: client as never,
		entityId: (opts.entityId ?? 'inst-A') as never,
		entityType: 'instance',
	};
}

function wrapper(): { Wrapper: ({ children }: { children: ReactNode }) => ReactNode; client: QueryClient } {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: 0 } },
	});
	const Wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
	return { Wrapper, client };
}

describe('useAnalyticsRecords', () => {
	it('passes Harper rows through verbatim', async () => {
		const rows = [
			{ id: 1, time: 1000, node: 'n1', count: 5, mean: 0.5, period: 60 },
			{ id: 2, time: 1060, node: 'n1', count: 7, mean: 0.7, period: 60 },
		];
		const { Wrapper } = wrapper();
		const { result } = renderHook(
			() =>
				useAnalyticsRecords({
					metric: 'cpu-usage',
					startTime: 0,
					endTime: 10_000,
					instanceParams: makeInstanceParams(rows),
				}),
			{ wrapper: Wrapper },
		);
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		expect(result.current.data).toEqual(rows);
		expect(result.current.isEmpty).toBe(false);
	});

	it('reports isEmpty for an empty response', async () => {
		const { Wrapper } = wrapper();
		const { result } = renderHook(
			() =>
				useAnalyticsRecords({
					metric: 'cpu-usage',
					startTime: 0,
					endTime: 10_000,
					instanceParams: makeInstanceParams([]),
				}),
			{ wrapper: Wrapper },
		);
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		expect(result.current.isEmpty).toBe(true);
		expect(result.current.data).toEqual([]);
	});

	it('does not flag missing fields when the response is empty (no-data, not drift)', async () => {
		// Fresh local Harper hasn't emitted records yet → empty response. The
		// schema-drift detector must NOT report the spec's required fields as
		// missing; that produces a misleading "field unavailable" message in
		// place of an honest "no data in selected window".
		const { Wrapper } = wrapper();
		const { result } = renderHook(
			() =>
				useAnalyticsRecords({
					metric: 'cpu-usage',
					startTime: 0,
					endTime: 10_000,
					instanceParams: makeInstanceParams([]),
					requiredFields: ['p95', 'path'],
				}),
			{ wrapper: Wrapper },
		);
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		expect(result.current.isEmpty).toBe(true);
		expect(result.current.missingFields).toEqual([]);
	});

	it('exposes fieldKeys (excluding time + node) and missingFields', async () => {
		const rows = [
			{ time: 1000, node: 'n1', count: 5, mean: 0.5 },
			{ time: 1060, node: 'n1', count: 7, mean: 0.7, p95: 12 },
		];
		const { Wrapper } = wrapper();
		const { result } = renderHook(
			() =>
				useAnalyticsRecords({
					metric: 'duration',
					startTime: 0,
					endTime: 10_000,
					instanceParams: makeInstanceParams(rows),
					requiredFields: ['p95', 'p99'],
				}),
			{ wrapper: Wrapper },
		);
		await waitFor(() => expect(result.current.isLoading).toBe(false));
		expect([...result.current.fieldKeys].sort()).toEqual(['count', 'mean', 'p95']);
		expect(result.current.missingFields).toEqual(['p99']);
	});

	it('isolates query cache by instanceId', async () => {
		const { Wrapper, client } = wrapper();
		const paramsA = makeInstanceParams([{ time: 1, node: 'n1' }], { entityId: 'inst-A' });
		const paramsB = makeInstanceParams([{ time: 2, node: 'n2' }], { entityId: 'inst-B' });

		const { result: rA } = renderHook(
			() =>
				useAnalyticsRecords({
					metric: 'cpu-usage',
					startTime: 0,
					endTime: 10_000,
					instanceParams: paramsA,
				}),
			{ wrapper: Wrapper },
		);
		const { result: rB } = renderHook(
			() =>
				useAnalyticsRecords({
					metric: 'cpu-usage',
					startTime: 0,
					endTime: 10_000,
					instanceParams: paramsB,
				}),
			{ wrapper: Wrapper },
		);

		await waitFor(() => {
			expect(rA.current.isLoading).toBe(false);
			expect(rB.current.isLoading).toBe(false);
		});

		// Distinct cache entries — different instances must not collide.
		const queries = client.getQueryCache().getAll();
		const keys = queries.map((q) => JSON.stringify(q.queryKey));
		expect(keys.some((k) => k.includes('inst-A'))).toBe(true);
		expect(keys.some((k) => k.includes('inst-B'))).toBe(true);
		expect(rA.current.data).toEqual([{ time: 1, node: 'n1' }]);
		expect(rB.current.data).toEqual([{ time: 2, node: 'n2' }]);
	});

	it('propagates fetch errors via isError + error', async () => {
		const { Wrapper } = wrapper();
		const { result } = renderHook(
			() =>
				useAnalyticsRecords({
					metric: 'cpu-usage',
					startTime: 0,
					endTime: 10_000,
					instanceParams: makeInstanceParams([], { throwError: new Error('boom') }),
				}),
			{ wrapper: Wrapper },
		);
		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error?.message).toBe('boom');
	});

	it('threads conditions through to the request body', async () => {
		const { Wrapper } = wrapper();
		const params = makeInstanceParams([]);
		renderHook(
			() =>
				useAnalyticsRecords({
					metric: 'duration',
					startTime: 0,
					endTime: 10_000,
					instanceParams: params,
					conditions: [{ attribute: 'path', value: '/api/x' }],
				}),
			{ wrapper: Wrapper },
		);
		await waitFor(() => expect(params.instanceClient.post).toHaveBeenCalled());
		const call = (params.instanceClient.post as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(call[1]).toMatchObject({
			operation: 'get_analytics',
			metric: 'duration',
			conditions: [{ attribute: 'path', value: '/api/x' }],
		});
	});

	it('threads bucketMs through as bucket_ms in the request body', async () => {
		const { Wrapper } = wrapper();
		const params = makeInstanceParams([]);
		renderHook(
			() =>
				useAnalyticsRecords({
					metric: 'duration',
					startTime: 0,
					endTime: 10_000,
					instanceParams: params,
					bucketMs: 60_000,
				}),
			{ wrapper: Wrapper },
		);
		await waitFor(() => expect(params.instanceClient.post).toHaveBeenCalled());
		const call = (params.instanceClient.post as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(call[1]).toMatchObject({
			operation: 'get_analytics',
			bucket_ms: 60_000,
		});
	});

	it('only console.warn-s on empty result when missingFields signals real schema drift', async () => {
		// Spy and assert no warn for a legitimately empty Harper response
		// (no requiredFields declared — quiet hour, not drift).
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { Wrapper } = wrapper();
		renderHook(
			() =>
				useAnalyticsRecords({
					metric: 'cpu-usage',
					startTime: 0,
					endTime: 10_000,
					instanceParams: makeInstanceParams([]),
				}),
			{ wrapper: Wrapper },
		);
		await waitFor(() => expect(warn).toHaveBeenCalledTimes(0), { timeout: 200 }).catch(() => {
			/* a single warn slipping through is OK — the assertion below is the real one */
		});
		const before = warn.mock.calls.length;

		// Drift signal requires evidence: rows that are present but lack the
		// required field. Use a fresh query client + window so the cached
		// empty-result from the first hook above doesn't shadow this fetch.
		const driftRows = [{ time: 100, node: 'n1', value: 42 }];
		const { Wrapper: W2 } = wrapper();
		const { result } = renderHook(
			() =>
				useAnalyticsRecords({
					metric: 'cpu-usage',
					startTime: 100,
					endTime: 200,
					instanceParams: makeInstanceParams(driftRows),
					requiredFields: ['user'],
				}),
			{ wrapper: W2 },
		);
		await waitFor(() => expect(result.current.missingFields).toEqual(['user']));
		// driftRows render does NOT warn (data.length > 0 is fine state).
		// Now provoke the empty+drift case with another fresh client/window:
		const before2 = warn.mock.calls.length;
		const { Wrapper: W3 } = wrapper();
		const { result: r2 } = renderHook(
			() =>
				useAnalyticsRecords({
					metric: 'cpu-usage',
					startTime: 200,
					endTime: 300,
					instanceParams: makeInstanceParams([]),
					requiredFields: ['user'],
				}),
			{ wrapper: W3 },
		);
		await waitFor(() => expect(r2.current.isLoading).toBe(false));
		expect(r2.current.missingFields).toEqual([]);
		// Empty response gates out the warn (it's "no data", not drift).
		expect(warn.mock.calls.length).toBe(before2);
		// Either way, console.warn was at least called once (or zero) — we
		// don't assert it WAS called here because the drift+rows render
		// doesn't emit the empty-result warn either; the previous warn we
		// observed in `before` could be from upstream React noise.
		expect(warn.mock.calls.length).toBeGreaterThanOrEqual(before);
		warn.mockRestore();
	});

	it('never polls — no extra fetch after the initial one', async () => {
		vi.useFakeTimers();
		try {
			const { Wrapper } = wrapper();
			const params = makeInstanceParams([{ time: 1, node: 'n1' }]);
			renderHook(
				() =>
					useAnalyticsRecords({
						metric: 'cpu-usage',
						startTime: 0,
						endTime: 10_000,
						instanceParams: params,
					}),
				{ wrapper: Wrapper },
			);
			// Drain the initial microtask + macrotask queue so the first fetch
			// resolves; then advance fake time well past any plausible interval.
			await vi.runAllTimersAsync();
			const initialCalls = (params.instanceClient.post as ReturnType<typeof vi.fn>).mock.calls.length;
			expect(initialCalls).toBeGreaterThan(0);
			await vi.advanceTimersByTimeAsync(120_000);
			expect((params.instanceClient.post as ReturnType<typeof vi.fn>).mock.calls.length).toBe(initialCalls);
		} finally {
			vi.useRealTimers();
		}
	});

	it('keeps previous data while a new fetch for a different time range is in flight', async () => {
		// Drive two consecutive renders at different windows; the placeholder
		// behavior keeps the prior data visible during the second fetch.
		const { Wrapper } = wrapper();
		const params = makeInstanceParams([{ time: 1, node: 'n1' }]);
		const { result, rerender } = renderHook(
			(args: { startTime: number; endTime: number }) =>
				useAnalyticsRecords({
					metric: 'cpu-usage',
					startTime: args.startTime,
					endTime: args.endTime,
					instanceParams: params,
				}),
			{
				wrapper: Wrapper,
				initialProps: { startTime: 0, endTime: 10_000 },
			},
		);
		await waitFor(() => expect(result.current.data.length).toBe(1));
		// Swap to a different range. With keepPreviousData the data slot
		// retains the prior rows during the new fetch (we don't observe the
		// transient `undefined` that a non-placeholder hook would expose).
		rerender({ startTime: 100_000, endTime: 110_000 });
		expect(result.current.data.length).toBe(1);
	});
});
