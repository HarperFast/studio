/** @vitest-environment jsdom */
import { FakeIntersectionObserver } from '@/test/fakeIntersectionObserver';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIsOnScreen } from './useIsOnScreen';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	FakeIntersectionObserver.reset();
});

describe('useIsOnScreen', () => {
	it('is always true where the browser has no IntersectionObserver', () => {
		expect(typeof IntersectionObserver).toBe('undefined');
		const { result } = renderHook(() => useIsOnScreen(document.createElement('div')));
		expect(result.current).toBe(true);
	});

	it('is false until the observer reports the element, then follows it in and out of view', () => {
		vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
		const element = document.createElement('div');
		const { result } = renderHook(() => useIsOnScreen(element));
		expect(result.current).toBe(false);

		act(() => FakeIntersectionObserver.setIntersecting(true));
		expect(result.current).toBe(true);

		act(() => FakeIntersectionObserver.setIntersecting(false));
		expect(result.current).toBe(false);
	});

	it('observes with the given root margin and stops observing on unmount', () => {
		vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
		const element = document.createElement('div');
		const { unmount } = renderHook(() => useIsOnScreen(element, '200px'));
		const [observer] = FakeIntersectionObserver.instances;
		expect(observer.options?.rootMargin).toBe('200px');
		expect([...observer.targets]).toEqual([element]);

		unmount();
		expect(observer.targets.size).toBe(0);
	});

	it("does not carry a removed element's visibility over to its replacement", () => {
		vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
		const { result, rerender } = renderHook(({ element }) => useIsOnScreen(element), {
			initialProps: { element: document.createElement('div') as Element | null },
		});
		act(() => FakeIntersectionObserver.setIntersecting(true));
		expect(result.current).toBe(true);

		rerender({ element: null });
		expect(result.current).toBe(false);

		rerender({ element: document.createElement('div') });
		expect(result.current).toBe(false);
	});

	it('waits for an element before observing anything', () => {
		vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
		const { result } = renderHook(() => useIsOnScreen(null));
		expect(result.current).toBe(false);
		expect(FakeIntersectionObserver.instances).toHaveLength(0);
	});
});
