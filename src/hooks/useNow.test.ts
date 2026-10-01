/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNow } from './useNow';

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(Date.parse('2026-10-01T12:00:00Z'));
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe('useNow', () => {
	it('advances every subscriber on one shared 30s tick', () => {
		const first = renderHook(() => useNow());
		const second = renderHook(() => useNow());
		const start = first.result.current;
		expect(second.result.current).toBe(start);

		act(() => {
			vi.advanceTimersByTime(29_999);
		});
		expect(first.result.current).toBe(start);

		act(() => {
			vi.advanceTimersByTime(1);
		});
		expect(first.result.current).toBe(start + 30_000);
		expect(second.result.current).toBe(start + 30_000);
		expect(vi.getTimerCount()).toBe(1);
	});

	it('stops ticking when the last subscriber leaves, and reads a fresh time on the next', () => {
		const { unmount } = renderHook(() => useNow());
		unmount();
		expect(vi.getTimerCount()).toBe(0);

		vi.setSystemTime(Date.parse('2026-10-01T15:00:00Z'));
		const { result } = renderHook(() => useNow());
		expect(result.current).toBe(Date.parse('2026-10-01T15:00:00Z'));
	});
});
