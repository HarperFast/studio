/** @vitest-environment jsdom */
import { act, cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFitLevel } from './useFitLevel';

const WIDTHS = [500, 400, 300, 200];
const layout = { room: 350, growth: 0 };

function Bar({ resetKey = 'a', overflows }: { resetKey?: string; overflows?: (element: HTMLElement) => boolean }) {
	const ref = useRef<HTMLDivElement>(null);
	const level = useFitLevel(ref, WIDTHS.length, resetKey, overflows);
	return <div ref={ref} data-testid="bar" data-level={level} />;
}

const levelShown = (container: HTMLElement) =>
	Number(container.querySelector('[data-level]')?.getAttribute('data-level'));

class FakeResizeObserver {
	static callback: (() => void) | undefined;
	constructor(callback: () => void) {
		FakeResizeObserver.callback = callback;
	}
	observe() {}
	disconnect() {}
}

beforeEach(() => {
	vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function(this: HTMLElement) {
		return (WIDTHS[Number(this.dataset.level)] ?? 0) + layout.growth;
	});
	vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => layout.room);
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	layout.room = 350;
	layout.growth = 0;
	FakeResizeObserver.callback = undefined;
});

describe('useFitLevel', () => {
	it('steps from the richest layout to the first that fits', () => {
		const { container } = render(<Bar />);
		expect(levelShown(container)).toBe(2);
	});

	it('stops at the last layout when none fits', () => {
		layout.room = 100;
		const { container } = render(<Bar />);
		expect(levelShown(container)).toBe(3);
	});

	it('steps on for whatever the caller counts as not fitting', () => {
		const { container } = render(<Bar overflows={() => true} />);
		expect(levelShown(container)).toBe(3);
	});

	it('starts again from the richest layout for a new reset key', () => {
		const { container, rerender } = render(<Bar resetKey="a" />);
		layout.room = 450;
		rerender(<Bar resetKey="b" />);
		expect(levelShown(container)).toBe(1);
	});

	it('starts again from the richest layout when the element widens, and steps on when it narrows', () => {
		vi.stubGlobal('ResizeObserver', FakeResizeObserver);
		const { container } = render(<Bar />);
		expect(levelShown(container)).toBe(2);

		layout.room = 450;
		act(() => FakeResizeObserver.callback?.());
		expect(levelShown(container)).toBe(1);

		layout.room = 250;
		act(() => FakeResizeObserver.callback?.());
		expect(levelShown(container)).toBe(3);
	});

	it('steps on when its content grows in place, with no render and no change of width', () => {
		vi.stubGlobal('ResizeObserver', FakeResizeObserver);
		const { container } = render(<Bar />);
		expect(levelShown(container)).toBe(2);

		layout.growth = 100;
		act(() => FakeResizeObserver.callback?.());
		expect(levelShown(container)).toBe(3);
	});
});
