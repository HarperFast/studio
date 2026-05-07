// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnalyticsOnboardingHint } from './AnalyticsOnboardingHint.tsx';

const STORAGE_KEY = 'studio:analytics:onboarding-dismissed:v1';

afterEach(() => {
	cleanup();
	window.localStorage.removeItem(STORAGE_KEY);
});

beforeEach(() => {
	window.localStorage.removeItem(STORAGE_KEY);
});

describe('AnalyticsOnboardingHint', () => {
	it('renders the tip on first visit', async () => {
		render(<AnalyticsOnboardingHint />);
		expect(await screen.findByText(/Click a legend entry to isolate one node/i)).toBeTruthy();
	});

	it('does not render when previously dismissed', () => {
		window.localStorage.setItem(STORAGE_KEY, '1');
		const { container } = render(<AnalyticsOnboardingHint />);
		expect(container.textContent).toBe('');
	});

	it('persists the dismissal when the close button is clicked', async () => {
		render(<AnalyticsOnboardingHint />);
		const dismiss = await screen.findByLabelText(/Dismiss tip/i);
		fireEvent.click(dismiss);
		expect(window.localStorage.getItem(STORAGE_KEY)).toBe('1');
		// Hint also vanishes immediately.
		expect(screen.queryByText(/Click a legend entry/i)).toBeNull();
	});
});
