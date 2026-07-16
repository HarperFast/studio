/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DegradedIntelliSenseBanner } from './DegradedIntelliSenseBanner';

afterEach(cleanup);

describe('DegradedIntelliSenseBanner (HarperFast/studio#1504)', () => {
	it('announces politely rather than as an alert, so it is non-blocking', () => {
		render(<DegradedIntelliSenseBanner variant="budget" onDismiss={vi.fn()} />);
		expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
	});

	it('explains the budget degradation in terms the user can act on', () => {
		render(<DegradedIntelliSenseBanner variant="budget" onDismiss={vi.fn()} />);
		const text = screen.getByRole('status').textContent ?? '';
		expect(text).toMatch(/cannot find module/i);
		expect(text).toMatch(/reopening the tab/i);
	});

	it('explains the oversized-file degradation', () => {
		render(<DegradedIntelliSenseBanner variant="oversized" onDismiss={vi.fn()} />);
		expect(screen.getByRole('status').textContent ?? '').toMatch(/plain text/i);
	});

	it('invokes onDismiss when the dismiss control is clicked', () => {
		const onDismiss = vi.fn();
		render(<DegradedIntelliSenseBanner variant="oversized" onDismiss={onDismiss} />);
		fireEvent.click(screen.getByRole('button', { name: /dismiss notice/i }));
		expect(onDismiss).toHaveBeenCalledOnce();
	});
});
