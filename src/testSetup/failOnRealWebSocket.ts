// No test may open a real WebSocket (#1689). Under vitest's jsdom environment a real one cannot even
// work: undici builds its `open` event from jsdom's global `Event` but dispatches it on Node's
// EventTarget, so a completed handshake throws an uncaught error that fails a run of green tests.
// The stand-in is inert rather than throwing so that no construction site — a timer, an import, an
// event handler — can raise an unhandled error of its own; the offending test fails in afterEach.
import { afterAll, afterEach } from 'vitest';

const blockedUrls: string[] = [];

function describeUrl(url: string): string {
	try {
		const { protocol, host, pathname } = new URL(url);
		return `${protocol}//${host}${pathname}`;
	} catch {
		return '<invalid URL>';
	}
}

export class BlockedWebSocket {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSING = 2;
	static readonly CLOSED = 3;

	// A real socket also exposes these on each instance (`socket.OPEN`); code under test may read them there.
	readonly CONNECTING = 0;
	readonly OPEN = 1;
	readonly CLOSING = 2;
	readonly CLOSED = 3;

	readonly url: string;
	readyState: number = BlockedWebSocket.CONNECTING;
	onopen: unknown = null;
	onmessage: unknown = null;
	onerror: unknown = null;
	onclose: unknown = null;

	constructor(url: string | URL) {
		this.url = String(url);
		blockedUrls.push(describeUrl(this.url));
	}

	send() {}

	close() {
		this.readyState = BlockedWebSocket.CLOSED;
	}

	addEventListener() {}

	removeEventListener() {}

	dispatchEvent() {
		return false;
	}
}

export function drainBlockedWebSocketUrls(): string[] {
	return blockedUrls.splice(0);
}

export function blockedWebSocketFailure(urls: string[]): string {
	return `This test tried to open a real WebSocket to ${urls.join(', ')}. `
		+ `Stub it with vi.stubGlobal('WebSocket', …) (see NotificationsSubscriptionManager.test.tsx). `
		+ `The usual source is NotificationsSubscriptionManager under the cloud root (TestProvider), which `
		+ `connects whenever VITE_CENTRAL_MANAGER_API_URL is set: by vi.stubEnv, by the shell, or by an .env `
		+ `file if vitest.config.ts has lost envDir: false.`;
}

// A test that already failed gets a log line, not a hook error that would shadow its own failure.
export function reportBlockedWebSockets(testAlreadyFailed: boolean): void {
	if (blockedUrls.length === 0) { return; }
	const message = blockedWebSocketFailure(drainBlockedWebSocketUrls());
	if (testAlreadyFailed) {
		console.error(`[failOnRealWebSocket] ${message}`);
		return;
	}
	throw new Error(message);
}

// Assigned rather than vi.stubGlobal'd, so a test's vi.unstubAllGlobals() restores this stand-in
// rather than the real WebSocket.
globalThis.WebSocket = BlockedWebSocket as unknown as typeof WebSocket;

afterEach((context) => {
	reportBlockedWebSockets(context.task.result?.state === 'fail');
});

// Catches a socket built after the last afterEach, e.g. in a test file's own afterAll.
afterAll(() => {
	reportBlockedWebSockets(false);
});
