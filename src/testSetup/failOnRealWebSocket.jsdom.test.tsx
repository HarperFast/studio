/**
 * @vitest-environment jsdom
 */
import { TestProvider } from '@/lib/test/TestProvider';
import { cleanup, render } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlockedWebSocket, drainBlockedWebSocketUrls } from './failOnRealWebSocket';

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

		render(
			<TestProvider>
				<div />
			</TestProvider>,
		);
		await act(() => null);

		expect(drainBlockedWebSocketUrls()).toEqual(['wss://cm.test.invalid/SystemStatus']);
		expect(warn).not.toHaveBeenCalled();
	});
});
