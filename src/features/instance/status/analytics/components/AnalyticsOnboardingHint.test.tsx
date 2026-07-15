// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AnalyticsOnboardingHint } from './AnalyticsOnboardingHint';

const STORAGE_KEY = 'studio:analytics:onboarding-dismissed:v2';

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
		// The heatmap-drilldown claim must stay truthful — the feature ships
		// with #1455, so the hint may advertise it.
		expect(screen.getByText(/replication heatmap, click a cell/i)).toBeTruthy();
	});

	it('re-shows the tip for users who dismissed the v1 copy (key is versioned)', async () => {
		window.localStorage.setItem('studio:analytics:onboarding-dismissed:v1', '1');
		try {
			render(<AnalyticsOnboardingHint />);
			expect(await screen.findByText(/Click a legend entry to isolate one node/i)).toBeTruthy();
		} finally {
			window.localStorage.removeItem('studio:analytics:onboarding-dismissed:v1');
		}
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
