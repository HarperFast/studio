// No test should open a real WebSocket, and under vitest one that tries takes the whole run with
// it. Mounting anything that pulls in the app shell (TestProvider mounts the real router) starts
// the SystemStatus socket; in jsdom that resolves to undici 8's WebSocket, whose Event class comes
// from a different realm than jsdom's, so connecting throws
//
//   TypeError: The "event" argument must be an instance of Event. Received an instance of Event
//
// as an UNHANDLED error. Tests still pass — vitest reports "2741 passed, 1 error" — but it exits
// non-zero, so the pre-commit hook rejects the commit. It is also racy: whether the socket connects
// before the run ends varies, which made committing in this repo a coin flip.
//
// Related to but distinct from the undici-7 pin in AGENTS.md: that one is jsdom failing to import
// a module undici 8 removed. This is the cross-realm Event mismatch, and it needs jsdom and undici
// to agree on Event — pinning jsdom's undici does not fix it for code that reaches undici's
// WebSocket directly.
//
// Stubbing globally rather than per test file: no unit test wants live socket behaviour, and doing
// it here means a new test that happens to mount the app shell doesn't reintroduce the flake.
class InertWebSocket {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSING = 2;
	static readonly CLOSED = 3;
	readyState = InertWebSocket.CLOSED;
	close() {}
	send() {}
	addEventListener() {}
	removeEventListener() {}
	dispatchEvent() {
		return false;
	}
}

globalThis.WebSocket = InertWebSocket as unknown as typeof WebSocket;
