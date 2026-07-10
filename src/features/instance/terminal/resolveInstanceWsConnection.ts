import { authStore, EntityIds, OverallAppSignIn } from '@/features/auth/store/authStore';
import { TERMINAL_SUBPROTOCOL, TerminalAuth } from './wire';

/** Path the Harper terminal upgrade handler listens on (operations port). */
export const TERMINAL_WS_PATH = '/terminal';

export interface ResolvedTerminalWs {
	/** `wss://host:port/terminal` — the operations API origin. */
	url: string;
	/** `[TERMINAL_SUBPROTOCOL]` — identifies the upgrade; carries no credential. */
	protocols: string[];
	/**
	 * Credential to send in the first WebSocket frame (see `wire.ts`). `undefined`
	 * when the session has neither an operation token nor stored basic auth — the
	 * caller should surface that rather than open an unauthenticatable socket.
	 */
	auth: TerminalAuth | undefined;
}

/**
 * Resolve the terminal WebSocket target — the WS analog of
 * {@link resolveInstanceConnection}.
 *
 * The terminal lives on the **operations API port** (same origin as
 * `authStore.getOperationsUrl`), keeping it on the same security boundary as the
 * rest of the operations surface rather than the application data port. Because
 * browsers can't set request headers on a WebSocket, the credential is returned
 * here for the caller to send as the first frame rather than as an
 * `Authorization` header.
 *
 * Only meaningful on a DIRECT connection: the Fabric Connect proxy buffers/does
 * not upgrade streamed responses. Gate on `useSupportsTerminal`
 * (`authStore.isDirectConnection`) before opening the socket.
 */
export function resolveInstanceWsConnection(
	{ id = OverallAppSignIn }: { id?: EntityIds } = {},
): ResolvedTerminalWs {
	const operationsUrl = authStore.getOperationsUrl(id);
	if (!operationsUrl) {
		throw new Error(`No operations URL is known for "${id}"; cannot open a terminal WebSocket.`);
	}

	const url = new URL(operationsUrl);
	url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
	url.pathname = TERMINAL_WS_PATH;

	const token = authStore.getOperationToken(id);
	const basic = authStore.checkForBasicAuth(id);
	const auth: TerminalAuth | undefined = token
		? { token }
		: basic
		? { username: basic.username, password: basic.password }
		: undefined;

	return { url: url.toString(), protocols: [TERMINAL_SUBPROTOCOL], auth };
}
