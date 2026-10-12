import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	BlockedWebSocket,
	blockedWebSocketFailure,
	drainBlockedWebSocketUrls,
	reportBlockedWebSockets,
} from './failOnRealWebSocket';

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('failOnRealWebSocket — node environment', () => {
	it('replaces the global WebSocket with the inert stand-in', () => {
		expect(globalThis.WebSocket).toBe(BlockedWebSocket);
	});

	it('hands back a socket that never connects and records where it was pointed', async () => {
		const socket = new WebSocket('wss://cm.test.invalid/SystemStatus');
		const onopen = vi.fn();
		socket.onopen = onopen;
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(socket).toBeInstanceOf(BlockedWebSocket);
		expect(socket.readyState).toBe(WebSocket.CONNECTING);
		expect(onopen).not.toHaveBeenCalled();
		expect([socket.CONNECTING, socket.OPEN, socket.CLOSING, socket.CLOSED]).toEqual([0, 1, 2, 3]);
		socket.close();
		expect(socket.readyState).toBe(socket.CLOSED);
		expect(drainBlockedWebSocketUrls()).toEqual(['wss://cm.test.invalid/SystemStatus']);
		expect(drainBlockedWebSocketUrls()).toEqual([]);
	});

	it('records the URL without credentials, query, or fragment', () => {
		const socket = new WebSocket('wss://user:secret@cm.test.invalid/SystemStatus?token=abc#frag');
		expect(socket.url).toContain('token=abc');
		expect(drainBlockedWebSocketUrls()).toEqual(['wss://cm.test.invalid/SystemStatus']);
	});

	it('is what vi.unstubAllGlobals() restores, not the real WebSocket', () => {
		class StubWebSocket {}
		vi.stubGlobal('WebSocket', StubWebSocket);
		expect(globalThis.WebSocket).toBe(StubWebSocket);
		vi.unstubAllGlobals();
		expect(globalThis.WebSocket).toBe(BlockedWebSocket);
	});

	it.fails('fails a test that constructs a WebSocket without stubbing it', () => {
		const socket = new WebSocket('wss://cm.test.invalid/SystemStatus');
		expect(socket.readyState).toBe(WebSocket.CONNECTING);
	});

	it('throws the named failure from the hook when the test had otherwise passed', () => {
		const socket = new WebSocket('wss://cm.test.invalid/SystemStatus');
		socket.close();
		expect(() => reportBlockedWebSockets(false)).toThrow(
			blockedWebSocketFailure(['wss://cm.test.invalid/SystemStatus']),
		);
	});

	it('logs instead of throwing when the test already failed, so the primary failure stays primary', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const socket = new WebSocket('wss://cm.test.invalid/SystemStatus');
		socket.close();

		expect(() => reportBlockedWebSockets(true)).not.toThrow();
		expect(error).toHaveBeenCalledWith(expect.stringContaining('wss://cm.test.invalid/SystemStatus'));
		expect(drainBlockedWebSocketUrls()).toEqual([]);
	});

	it('names every blocked URL and the remedy in the failure', () => {
		const message = blockedWebSocketFailure(['wss://a.invalid/One', 'wss://b.invalid/Two']);
		expect(message).toContain('wss://a.invalid/One, wss://b.invalid/Two');
		expect(message).toContain("vi.stubGlobal('WebSocket'");
		expect(message).toContain('envDir: false');
	});
});
