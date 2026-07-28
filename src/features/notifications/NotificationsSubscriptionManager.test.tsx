/**
 * @vitest-environment jsdom
 */
import { NotificationsSubscriptionManager } from '@/features/notifications/NotificationsSubscriptionManager';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Drives the subscription's reconnect logic with fake timers and a stub WebSocket, locking in the
 * failure modes this file has produced: a permanent silent give-up, and a reconnect storm from any path
 * that unwinds the backoff (post-handshake close, or a burst of `online` events).
 */

/** Minimal stand-in for the browser WebSocket: records instances and lets the test drive the events. */
class StubWebSocket {
	static instances: StubWebSocket[] = [];
	onopen: (() => void) | null = null;
	onmessage: ((event: unknown) => void) | null = null;
	onerror: (() => void) | null = null;
	onclose: (() => void) | null = null;
	private closed = false;

	constructor(public url: string) {
		StubWebSocket.instances.push(this);
	}

	/** The component (and its cleanup) calls this; a real socket then fires `close`. */
	close() {
		this.fireClose();
	}

	/** Server accepted the upgrade. */
	acceptUpgrade() {
		this.onopen?.();
	}

	/** Server hung up (or the network dropped). */
	hangUp() {
		this.fireClose();
	}

	// A real socket fires `close` at most once, so repeated closes must not schedule extra reconnects.
	private fireClose() {
		if (this.closed) { return; }
		this.closed = true;
		this.onclose?.();
	}
}

const socketCount = () => StubWebSocket.instances.length;
const newestSocket = () => StubWebSocket.instances[StubWebSocket.instances.length - 1];

beforeEach(() => {
	StubWebSocket.instances = [];
	vi.stubEnv('VITE_CENTRAL_MANAGER_API_URL', 'https://cm.test.invalid');
	vi.stubGlobal('WebSocket', StubWebSocket);
	// Keeps the give-up test quiet — the component warns once when it reaches the backoff ceiling.
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	vi.useFakeTimers();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe('NotificationsSubscriptionManager', () => {
	it('opens one subscription to the SystemStatus WebSocket endpoint', () => {
		render(<NotificationsSubscriptionManager />);
		expect(socketCount()).toBe(1);
		// http(s) base is rewritten to the ws(s) scheme.
		expect(newestSocket().url).toBe('wss://cm.test.invalid/SystemStatus');
	});

	it('keeps retrying after many consecutive failures instead of giving up permanently', () => {
		render(<NotificationsSubscriptionManager />);

		// Six failed attempts, each waited out at (or under) the 30s ceiling.
		for (let i = 0; i < 6; i++) {
			newestSocket().hangUp();
			vi.advanceTimersByTime(30_000);
		}

		// A 7th socket exists: the retry loop is bounded in *delay*, not in attempts.
		expect(socketCount()).toBe(7);
	});

	it('escalates the delay when the server accepts the upgrade then closes it', () => {
		render(<NotificationsSubscriptionManager />);

		// Accept-then-close, well short of a healthy session → first retry after 2s.
		newestSocket().acceptUpgrade();
		newestSocket().hangUp();
		vi.advanceTimersByTime(1999);
		expect(socketCount()).toBe(1);
		vi.advanceTimersByTime(1);
		expect(socketCount()).toBe(2);

		// Same again: the delay must grow to 4s rather than stay pinned at 2s.
		newestSocket().acceptUpgrade();
		newestSocket().hangUp();
		vi.advanceTimersByTime(2000);
		expect(socketCount()).toBe(2);
		vi.advanceTimersByTime(2000);
		expect(socketCount()).toBe(3);
	});

	it('resets the backoff only after the socket stays open for a healthy session', () => {
		render(<NotificationsSubscriptionManager />);

		// Escalate to a 4s delay.
		newestSocket().acceptUpgrade();
		newestSocket().hangUp();
		vi.advanceTimersByTime(2000);
		expect(socketCount()).toBe(2);

		// This one stays open past the healthy-session threshold, so the backoff resets…
		newestSocket().acceptUpgrade();
		vi.advanceTimersByTime(10_000);

		// …and the next failure starts again from 2s, not 4s.
		newestSocket().hangUp();
		vi.advanceTimersByTime(1999);
		expect(socketCount()).toBe(2);
		vi.advanceTimersByTime(1);
		expect(socketCount()).toBe(3);
	});

	it('collapses a burst of online events into a single reconnect', () => {
		render(<NotificationsSubscriptionManager />);

		// Two failures → a 4s wait is pending and no socket is live.
		newestSocket().hangUp();
		vi.advanceTimersByTime(2000);
		newestSocket().hangUp();
		expect(socketCount()).toBe(2);

		// Past the online floor but before the retry fires. Each event is followed by a failure — that's
		// what frees the "already connected" guard, so without the time floor every one of them would
		// start a socket at the same millisecond.
		vi.advanceTimersByTime(2500);
		for (let i = 0; i < 5; i++) {
			window.dispatchEvent(new Event('online'));
			newestSocket().hangUp();
		}

		// One reconnect, not five.
		expect(socketCount()).toBe(3);
	});

	it('online skips the remaining wait without unwinding the escalation', () => {
		render(<NotificationsSubscriptionManager />);

		// Reach a 4s delay (failures = 2).
		newestSocket().hangUp();
		vi.advanceTimersByTime(2000);
		newestSocket().hangUp();
		expect(socketCount()).toBe(2);

		// `online` reconnects early…
		vi.advanceTimersByTime(2500);
		window.dispatchEvent(new Event('online'));
		expect(socketCount()).toBe(3);

		// …but the next failure waits 8s (failures kept climbing), not 2s as it would after a reset.
		newestSocket().hangUp();
		vi.advanceTimersByTime(4000);
		expect(socketCount()).toBe(3);
		vi.advanceTimersByTime(4000);
		expect(socketCount()).toBe(4);
	});

	it('survives a WebSocket constructor that throws, and retries on a backoff', () => {
		// A malformed base URL makes the real constructor throw synchronously — that must not escape the
		// effect (this runs on the sign-in page for anonymous users).
		let attempts = 0;
		vi.stubGlobal(
			'WebSocket',
			class {
				constructor() {
					attempts += 1;
					throw new SyntaxError('bad url');
				}
			},
		);

		expect(() => render(<NotificationsSubscriptionManager />)).not.toThrow();
		expect(attempts).toBe(1);

		// Still retries rather than wedging on the first throw.
		vi.advanceTimersByTime(2000);
		expect(attempts).toBe(2);
	});

	it('does not subscribe when the central-manager URL is unset', () => {
		vi.stubEnv('VITE_CENTRAL_MANAGER_API_URL', '');
		render(<NotificationsSubscriptionManager />);
		expect(socketCount()).toBe(0);
	});

	it('stops reconnecting once unmounted', () => {
		const { unmount } = render(<NotificationsSubscriptionManager />);
		unmount();

		// The teardown closes the socket; that close must not schedule another attempt.
		vi.advanceTimersByTime(120_000);
		window.dispatchEvent(new Event('online'));
		expect(socketCount()).toBe(1);
	});
});
