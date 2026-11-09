/**
 * @vitest-environment jsdom
 */
import { FloatingChat } from '@/features/instance/applications/components/Chat/FloatingChat';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// jsdom does no layout, and the global ResizeObserver stub never calls back; drive both by hand
// (motion observes too, so every observer gets an empty batch).
const clientHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight');
let containerHeight = 0;
const observers: ((entries: ResizeObserverEntry[]) => void)[] = [];

beforeEach(() => {
	localStorage.clear();
	sessionStorage.clear();
	observers.length = 0;
	Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get: () => containerHeight });
	vi.stubGlobal(
		'ResizeObserver',
		class {
			constructor(callback: (entries: ResizeObserverEntry[]) => void) {
				observers.push(callback);
			}
			observe() {}
			unobserve() {}
			disconnect() {}
		},
	);
});
afterEach(() => {
	cleanup();
	localStorage.clear();
	vi.unstubAllGlobals();
	if (clientHeight) { Object.defineProperty(Element.prototype, 'clientHeight', clientHeight); }
});

function resizeContainer(height: number) {
	containerHeight = height;
	act(() => observers.forEach((callback) => callback([])));
}

const bubbleTransform = () => (screen.getByRole('button') as HTMLElement).style.transform;

describe('FloatingChat bubble', () => {
	it('stays on screen while the banner shrinks its container, then returns to where it was snapped', () => {
		// Snapped to the top of an 800px container: 800 - 56 (bubble) - 2 × 24 (padding) above its anchor.
		localStorage.setItem('ApplicationChatPosition', JSON.stringify({ x: -40, y: -696 }));
		containerHeight = 800;
		render(<FloatingChat />);
		expect(bubbleTransform()).toContain('translateY(-696px)');

		resizeContainer(753);
		expect(bubbleTransform()).toContain('translateY(-649px)');

		resizeContainer(800);
		expect(bubbleTransform()).toContain('translateY(-696px)');
		expect(JSON.parse(localStorage.getItem('ApplicationChatPosition') ?? 'null')).toEqual({ x: -40, y: -696 });
	});

	it('is clamped from its first paint when a notice is already showing', () => {
		localStorage.setItem('ApplicationChatPosition', JSON.stringify({ x: -40, y: -696 }));
		containerHeight = 753;
		render(<FloatingChat />);
		expect(bubbleTransform()).toContain('translateY(-649px)');
	});

	it('leaves a bubble that still fits where it is', () => {
		containerHeight = 753;
		render(<FloatingChat />);
		expect(bubbleTransform()).toContain('translateY(-40px)');
	});
});
