/**
 * @vitest-environment jsdom
 */
import { queryClient } from '@/react-query/queryClient';
import { useNewRouter } from '@/router/useNewRouter';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { cleanup, render } from '@testing-library/react';
import { act, useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlockedWebSocket, drainBlockedWebSocketUrls } from './failOnRealWebSocket';

/**
 * The app's real route tree, whose cloud root mounts `NotificationsSubscriptionManager` and so opens
 * the SystemStatus socket. `TestProvider` deliberately renders a bare root route now, so it no longer
 * reaches that code.
 */
function CloudRoot() {
	const router = useNewRouter({});
	// A hash history patches `window.history`; one left behind would answer the next test's navigation.
	useEffect(() => () => router.history.destroy(), [router]);
	return (
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>
	);
}

afterEach(() => {
	cleanup();
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe('failOnRealWebSocket — jsdom environment', () => {
	it("replaces jsdom's WebSocket too", () => {
		expect(globalThis.WebSocket).toBe(BlockedWebSocket);
		expect(window.WebSocket).toBe(BlockedWebSocket);
	});

	it("catches the cloud root's SystemStatus subscription when the central-manager URL is set", async () => {
		vi.stubEnv('VITE_CENTRAL_MANAGER_API_URL', 'https://cm.test.invalid');
		const warn = vi.spyOn(console, 'warn');

		render(<CloudRoot />);
		await act(() => null);

		expect(drainBlockedWebSocketUrls()).toEqual(['wss://cm.test.invalid/SystemStatus']);
		expect(warn).not.toHaveBeenCalled();
	});
});
