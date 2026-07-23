/**
 * @vitest-environment jsdom
 */
import { NotificationBell } from '@/components/NotificationBell';
import { SystemStatusNotification } from '@/integrations/api/api.patch';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const active: SystemStatusNotification[] = [
	{ id: 'sta-1', type: 'error', message: 'Maintenance tonight', url: 'https://status.harper.io' },
	{ id: 'sta-2', type: 'info', message: 'New feature shipped' },
];

// Isolate the bell from data + routing; the underlying hooks/helpers are tested separately.
vi.mock('@/features/notifications/hooks', () => ({
	useActiveNotifications: () => active,
	useUnackedActiveNotifications: () => active,
	useNow: () => Date.UTC(2026, 6, 23, 12, 0, 0),
}));

vi.mock('@/features/notifications/acks', () => ({
	useNotificationAcks: () => new Set<string>(),
	ackNotification: vi.fn(),
	unackNotification: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
	Link: ({ children, to }: { children?: ReactNode; to?: string }) => <a href={to}>{children}</a>,
}));

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

afterEach(() => cleanup());

describe('NotificationBell', () => {
	it('shows the unread count on the bell', () => {
		render(<NotificationBell />);
		const trigger = screen.getByRole('button', { name: /notifications \(2 unread\)/i });
		expect(trigger.textContent).toContain('2');
	});

	it('lists active notifications and a view-all link when opened', () => {
		render(<NotificationBell />);
		fireEvent.pointerDown(screen.getByRole('button', { name: /notifications/i }), { button: 0, ctrlKey: false });
		expect(screen.getByText('Maintenance tonight')).toBeTruthy();
		expect(screen.getByText('New feature shipped')).toBeTruthy();
		expect(screen.getByText(/view all notifications/i)).toBeTruthy();
	});
});
