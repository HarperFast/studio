/**
 * Terminal wire protocol — kept in sync with the Harper component
 * `components/terminal/index.ts` (branch: claude/instance-terminal-prototype).
 *
 * Auth is FIRST-MESSAGE: the socket connects unauthenticated, and the client's
 * first frame carries the credential. Nothing sensitive rides in the WebSocket
 * handshake headers/subprotocol (which intermediaries may log).
 *
 * Client → server (text frames, first char is an opcode):
 *   'a<json>'  auth — MUST be the first frame. JSON `{ token }` or
 *              `{ username, password }`. The server ignores all other frames
 *              until a valid super_user auth arrives.
 *   'i<data>'  stdin — bytes after the opcode are written to the PTY
 *   'r<json>'  resize — JSON `{ cols, rows }`
 * Server → client:
 *   raw PTY output as text frames (no opcode)
 *   close(code, reason) on auth failure, shell exit, idle, or policy rejection
 *
 * Close codes: 4401 unauthenticated, 4403 not super_user, 4408 idle/auth timeout,
 * 4429 session limit, 4500 backend error, 1000 normal shell exit.
 */

/** Subprotocol used to identify a terminal upgrade (no credential travels here). */
export const TERMINAL_SUBPROTOCOL = 'harper-terminal';

export const OPCODE_AUTH = 'a';
export const OPCODE_INPUT = 'i';
export const OPCODE_RESIZE = 'r';

export type TerminalAuth =
	| { token: string }
	| { username: string; password: string };

export function encodeAuth(auth: TerminalAuth): string {
	return OPCODE_AUTH + JSON.stringify(auth);
}

export function encodeInput(data: string): string {
	return OPCODE_INPUT + data;
}

export function encodeResize(cols: number, rows: number): string {
	return OPCODE_RESIZE + JSON.stringify({ cols, rows });
}
