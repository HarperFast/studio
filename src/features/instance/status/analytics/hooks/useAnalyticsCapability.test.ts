// @vitest-environment jsdom
import type { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig.ts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useAnalyticsCapability } from './useAnalyticsCapability.ts';

function makeParams(post: ReturnType<typeof vi.fn>): InstanceClientIdConfig & InstanceTypeConfig {
	return {
		instanceClient: { post } as never,
		entityId: 'inst-X' as never,
		entityType: 'instance',
	};
}

function wrap() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: 0 } },
	});
	const Wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
	return { Wrapper, client };
}

describe('useAnalyticsCapability', () => {
	it('returns supported=true when the first probe metric resolves', async () => {
		const post = vi.fn(async () => ({ data: [] }));
		const { Wrapper } = wrap();
		const { result } = renderHook(() => useAnalyticsCapability(makeParams(post)), { wrapper: Wrapper });
		await waitFor(() => expect(result.current.supported).toBe(true));
		expect(post).toHaveBeenCalledTimes(1);
	});

	it('falls through to the next probe metric on a 4xx (metric-not-found) error', async () => {
		// First probe metric is `utilization`; simulate a 4xx so the loop
		// walks to the next metric. 5xx / network errors short-circuit
		// instead — covered separately below.
		const post = vi.fn(async (_path, body) => {
			const metric = (body as { metric: string }).metric;
			if (metric === 'utilization') {
				const err = new Error('unknown metric') as Error & { status?: number };
				err.status = 404;
				throw err;
			}
			return { data: [] };
		});
		const { Wrapper } = wrap();
		const { result } = renderHook(() => useAnalyticsCapability(makeParams(post)), { wrapper: Wrapper });
		await waitFor(() => expect(result.current.supported).toBe(true));
		expect(post.mock.calls.length).toBeGreaterThanOrEqual(2);
	});

	it('does NOT walk the metric list on a transport-level (5xx) error — bails to retry instead', async () => {
		// 5xx implies the instance is unhealthy; hammering it with 3 more
		// metrics per attempt would compound the problem. Verify that the
		// hook reports error after exhausting retries rather than walking
		// the full metric list on each attempt.
		vi.useFakeTimers();
		try {
			let calls = 0;
			const post = vi.fn(async () => {
				calls++;
				const err = new Error('upstream unavailable') as Error & { status?: number };
				err.status = 503;
				throw err;
			});
			const { Wrapper } = wrap();
			const { result } = renderHook(() => useAnalyticsCapability(makeParams(post)), { wrapper: Wrapper });
			// Drive the initial attempt + retry: 2 through their exponential
			// backoff instantly rather than waiting ~3s of real wall-clock time.
			await act(async () => {
				await vi.runAllTimersAsync();
			});
			expect(result.current.error).toBeTruthy();
			// Worst case: 1 call per attempt × (1 + retry: 2) = 3 calls. We assert
			// fewer than 4 × 3 = 12 (which would mean the metric loop also walked).
			expect(calls).toBeLessThan(12);
		} finally {
			vi.useRealTimers();
		}
	});

	it.each([401, 403])(
		'bails immediately on %i without walking the metric list or backing off, and flags isAuthError',
		async (status) => {
			// Expired credentials fail every metric identically — walking the
			// list would just burn 3 more requests, and backoff retries can't
			// fix auth. One call, immediate error, auth-flavored flag.
			const post = vi.fn(async () => {
				const err = new Error('unauthorized') as Error & { status?: number };
				err.status = status;
				throw err;
			});
			const { Wrapper } = wrap();
			const { result } = renderHook(() => useAnalyticsCapability(makeParams(post)), { wrapper: Wrapper });
			await waitFor(() => expect(result.current.error).toBeTruthy());
			expect(post).toHaveBeenCalledTimes(1);
			expect(result.current.isAuthError).toBe(true);
			expect(result.current.supported).toBe(false);
		},
	);

	it('reports an error when every probe metric throws', async () => {
		vi.useFakeTimers();
		try {
			const post = vi.fn(async () => {
				throw new Error('analytics disabled');
			});
			const { Wrapper } = wrap();
			const { result } = renderHook(() => useAnalyticsCapability(makeParams(post)), { wrapper: Wrapper });
			await act(async () => {
				await vi.runAllTimersAsync();
			});
			expect(result.current.error).toBeTruthy();
			expect(result.current.supported).toBe(false);
			expect(result.current.isAuthError).toBe(false);
			expect(result.current.error?.message).toMatch(/analytics disabled/);
		} finally {
			vi.useRealTimers();
		}
	});

	it('exposes a retry() that re-fires the probe', async () => {
		// Phase 1: every probe metric throws → capability resolves to error
		// (after the hook's retry: 2). Phase 2: switch to success and call
		// retry() — capability flips to supported.
		vi.useFakeTimers();
		try {
			let phase: 'fail' | 'ok' = 'fail';
			const post = vi.fn(async () => {
				if (phase === 'fail') { throw new Error('analytics down'); }
				return { data: [] };
			});
			const { Wrapper } = wrap();
			const { result } = renderHook(() => useAnalyticsCapability(makeParams(post)), { wrapper: Wrapper });
			await act(async () => {
				await vi.runAllTimersAsync();
			});
			expect(result.current.error).toBeTruthy();
			expect(result.current.supported).toBe(false);
			phase = 'ok';
			await act(async () => {
				result.current.retry();
				await vi.runAllTimersAsync();
			});
			expect(result.current.supported).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});
});
