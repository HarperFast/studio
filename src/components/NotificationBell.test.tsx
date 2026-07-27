/**
 * @vitest-environment jsdom
 */
import { NotificationBell } from '@/components/NotificationBell';
import { queryClient } from '@/react-query/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Fixtures the mocked query serves. `vi.hoisted` so they exist when the hoisted vi.mock factory runs.
const { NOTIFICATIONS } = vi.hoisted(() => {
	const now = Date.now();
	return {
		NOTIFICATIONS: [
			{
				id: 'sta-critical',
				type: 'error',
				message: 'Investigating an outage',
				url: 'https://status.harper.io',
				startAt: null,
				endAt: null,
			},
			{ id: 'sta-info', type: 'info', message: 'New feature shipped', startAt: null, endAt: null },
			// Ended yesterday — the real active-window filter must exclude it.
			{
				id: 'sta-expired',
				type: 'warning',
				message: 'Old maintenance',
				startAt: new Date(now - 2 * 86_400_000).toISOString(),
				endAt: new Date(now - 86_400_000).toISOString(),
			},
		],
	};
});

// Mock ONLY the query (per review) — everything the bell actually computes (active-window filter,
// unread count, acked-first + severity sort, ack store) runs for real against a seeded cache.
vi.mock('@/features/notifications/queries', () => ({
	systemStatusQueryKey: ['system-status'],
	getSystemStatusQueryOptions: () => ({
		queryKey: ['system-status'],
		queryFn: () => Promise.resolve(NOTIFICATIONS),
		initialData: NOTIFICATIONS,
		staleTime: Infinity,
	}),
}));

// Only routing is stubbed (no RouterProvider in this unit test).
vi.mock('@tanstack/react-router', () => ({
	Link: ({ children, to }: { children?: ReactNode; to?: string }) => <a href={to}>{children}</a>,
}));

function renderBell() {
	return render(
		<QueryClientProvider client={queryClient}>
			<NotificationBell />
		</QueryClientProvider>,
	);
}

// Radix's menu relies on DOM APIs jsdom doesn't implement.
beforeAll(() => {
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => undefined;
	Element.prototype.releasePointerCapture ??= () => undefined;
	Element.prototype.scrollIntoView ??= () => undefined;
	if (typeof window.PointerEvent === 'undefined') {
		window.PointerEvent = class extends MouseEvent {} as typeof PointerEvent;
	}
});

beforeEach(() => {
	localStorage.clear();
	queryClient.clear();
});
afterEach(() => {
	cleanup();
	queryClient.clear();
	localStorage.clear();
});

function openMenu() {
	fireEvent.pointerDown(screen.getByRole('button', { name: /notifications/i }), { button: 0, ctrlKey: false });
}

describe('NotificationBell', () => {
	it('counts only active, un-acked notifications (excludes the expired one)', () => {
		renderBell();
		// 3 fixtures, but the expired notice is filtered out by the real active-window check → 2 unread.
		expect(screen.getByRole('button', { name: /notifications \(2 unread\)/i })).toBeTruthy();
	});

	it('drops an acknowledged notification from the unread count', () => {
		localStorage.setItem('AckedNotificationIds', JSON.stringify(['sta-info']));
		renderBell();
		expect(screen.getByRole('button', { name: /notifications \(1 unread\)/i })).toBeTruthy();
	});

	it('lists active notices, excludes expired, and orders un-acked before acked', () => {
		// Ack the critical one so the acked-first branch beats severity ordering.
		localStorage.setItem('AckedNotificationIds', JSON.stringify(['sta-critical']));
		renderBell();
		openMenu();

		expect(screen.getByText('Investigating an outage')).toBeTruthy();
		expect(screen.getByText('New feature shipped')).toBeTruthy();
		expect(screen.queryByText('Old maintenance')).toBeNull();
		expect(screen.getByText(/view all notifications/i)).toBeTruthy();

		const rows = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
		const infoIdx = rows.findIndex((t) => t.includes('New feature shipped'));
		const criticalIdx = rows.findIndex((t) => t.includes('Investigating an outage'));
		// Un-acked info sorts ahead of the acked critical, even though critical is more severe.
		expect(infoIdx).toBeLessThan(criticalIdx);
	});
});
