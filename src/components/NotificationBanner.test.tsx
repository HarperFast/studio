/**
 * @vitest-environment jsdom
 */
import { BANNER_HEIGHT_VAR, NotificationBanner } from '@/components/NotificationBanner';
import { queryClient } from '@/react-query/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { NOTIFICATIONS } = vi.hoisted(() => ({
	NOTIFICATIONS: [
		{
			id: 'sta-maintenance',
			type: 'maintenance',
			message: 'We will be performing routine maintenance on Monday October 26th on all clusters.',
			startAt: null,
			endAt: null,
		},
		{ id: 'sta-info', type: 'info', message: 'New feature shipped', startAt: null, endAt: null },
	],
}));

vi.mock('@/features/notifications/queries', () => ({
	systemStatusQueryKey: ['system-status'],
	getSystemStatusQueryOptions: () => ({
		queryKey: ['system-status'],
		queryFn: () => Promise.resolve(NOTIFICATIONS),
		initialData: NOTIFICATIONS,
		staleTime: Infinity,
	}),
}));

// jsdom does no layout, and the global ResizeObserver stub never calls back; drive both by hand.
const offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
let bannerHeight = 0;
const observers: { callback: () => void; disconnected: boolean }[] = [];

beforeEach(() => {
	localStorage.clear();
	queryClient.clear();
	bannerHeight = 0;
	observers.length = 0;
	Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => bannerHeight });
	vi.stubGlobal(
		'ResizeObserver',
		class {
			private record: { callback: () => void; disconnected: boolean };
			constructor(callback: () => void) {
				this.record = { callback, disconnected: false };
				observers.push(this.record);
			}
			observe() {}
			disconnect() {
				this.record.disconnected = true;
			}
		},
	);
});
afterEach(() => {
	cleanup();
	queryClient.clear();
	localStorage.clear();
	vi.unstubAllGlobals();
	if (offsetHeight) { Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeight); }
	document.documentElement.style.removeProperty(BANNER_HEIGHT_VAR);
});

const publishedHeight = () => document.documentElement.style.getPropertyValue(BANNER_HEIGHT_VAR);

describe('NotificationBanner', () => {
	it('publishes its height while shown, follows it as strips go, and withdraws it with the last one', async () => {
		bannerHeight = 94;
		render(
			<QueryClientProvider client={queryClient}>
				<NotificationBanner />
			</QueryClientProvider>,
		);
		expect(publishedHeight()).toBe('94px');

		fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss notification' })[0]);
		await waitFor(() => expect(screen.getAllByRole('button', { name: 'Dismiss notification' })).toHaveLength(1));
		bannerHeight = 47;
		observers[0].callback();
		expect(publishedHeight()).toBe('47px');

		fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
		await waitFor(() => expect(screen.queryByRole('region', { name: 'System notifications' })).toBeNull());
		expect(publishedHeight()).toBe('');
		expect(observers).toHaveLength(1);
		expect(observers[0].disconnected).toBe(true);
	});
});
