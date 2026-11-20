/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LogTimestamp } from './LogTimestamp';

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});
it('shows a readable timestamp with milliseconds, elapsed age and exact UTC on hover', () => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-11-20T17:56:52.529Z'));
	const { container } = render(<LogTimestamp value="2026-11-20T17:00:52.529Z" />);
	const time = container.querySelector('time')!;
	expect(time.textContent).toContain('2026');
	expect(time.textContent).toContain('52.529');
	expect(time.textContent).toContain('(56 minutes ago)');
	expect(time.dateTime).toBe('2026-11-20T17:00:52.529Z');
	expect(time.title).toBe('2026-11-20T17:00:52.529Z');
	act(() => vi.advanceTimersByTime(60000));
	expect(time.textContent).toContain('(57 minutes ago)');
});
it('handles future server times and preserves unreadable timestamp text', () => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-11-20T17:00:00Z'));
	const { rerender } = render(<LogTimestamp value="2026-11-20T19:00:00Z" />);
	expect(screen.getByText('(in 2 hours)')).toBeTruthy();
	rerender(<LogTimestamp value="unreadable timestamp" />);
	expect(screen.getByText('unreadable timestamp')).toBeTruthy();
	expect(vi.getTimerCount()).toBe(0);
});
