/** @vitest-environment jsdom */
import { FakeIntersectionObserver } from '@/test/fakeIntersectionObserver';
import { act, cleanup, renderHook } from '@testing-library/react';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useIsOnScreen } from './useIsOnScreen';

/** Hands the hook an element that no test variable holds, returning whether it has been collected. */
function showFreshElement(rerender: (props: { element: Element | null }) => void) {
	const element = document.createElement('div');
	const reference = new WeakRef(element);
	rerender({ element });
	return () => reference.deref() === undefined;
}

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

	it('lets go of an element once it is gone, so the detached node can be collected', async () => {
		vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
		setFlagsFromString('--expose-gc');
		const collectGarbage = runInNewContext('gc') as () => void;
		// Testing Library holds on to the initial props, so the element has to arrive by rerender.
		const { rerender } = renderHook(({ element }) => useIsOnScreen(element), {
			initialProps: { element: null } as { element: Element | null },
		});
		const collected = showFreshElement(rerender);
		act(() => FakeIntersectionObserver.setIntersecting(true));

		rerender({ element: null });
		// React keeps the previous render's props on the alternate fiber until the next render.
		rerender({ element: null });
		// The disconnected fake still holds its callback, which closes over the element.
		FakeIntersectionObserver.reset();
		await new Promise(resolve => setTimeout(resolve, 0));
		collectGarbage();

		expect(collected()).toBe(true);
	});

	it('waits for an element before observing anything', () => {
		vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
		const { result } = renderHook(() => useIsOnScreen(null));
		expect(result.current).toBe(false);
		expect(FakeIntersectionObserver.instances).toHaveLength(0);
	});
});
