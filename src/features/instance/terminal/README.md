# Instance terminal (PROTOTYPE)

An `xterm.js` terminal in Studio, wired over a WebSocket to a PTY running
**inside the customer's Harper instance container**. super_user-only,
direct-connection-only.

> **Status: prototype for team discussion.** Pairs with the Harper component on
> `claude/instance-terminal-prototype` (`components/terminal/`). Ships behind the
> instance's own opt-in (`terminal.enabled: true`) and Studio's super_user +
> direct-connection gates. It's the first slice of the "Claude in the container"
> direction and, more importantly, it establishes the authenticated app-port
> WebSocket channel the live-log-stream and inspector-bridge features will reuse.

## Files

| File | Role |
| --- | --- |
| `wire.ts` | Wire protocol — opcodes + subprotocol names. **Mirror of the Harper component.** |
| `resolveInstanceWsConnection.ts` | WS analog of `resolveInstanceConnection`: derives the `wss://` URL and the auth subprotocols. |
| `hooks/useSupportsTerminal.ts` | Direct-connection gate (mirrors `useSupportsLogSSE`). |
| `TerminalView.tsx` | xterm.js ↔ WebSocket wiring and lifecycle. |
| `index.tsx` | Page: super_user + direct-connection gates, prototype banner. |
| `routes.ts` | `terminal` route under the instance layout. |

Also touches: `../routes.ts` (registers the route) and `../InstanceNavBar.tsx`
(super_user-gated nav entry), and `package.json` (`@xterm/xterm`,
`@xterm/addon-fit`).

## Auth over WebSocket — first-message auth

Browsers can't set an `Authorization` header on `new WebSocket()`, and putting a
token in the handshake subprotocol leaks it into request headers that
intermediaries may log. So the credential is sent as the **first WebSocket
frame** instead (`wire.ts`, opcode `a`): the socket connects unauthenticated,
the client immediately sends `a{"token":...}` (or `a{"username":...,"password":...}`),
and Harper validates it and checks super_user before spawning anything. Nothing
sensitive rides in the handshake. `resolveInstanceWsConnection` returns the
credential; `TerminalView` sends it on open and treats the connection as
`authenticating` until the first byte comes back.

This also means Harper needs **no change to `security/auth.ts`** — the terminal
upgrade handler does its own first-message validation.

## Port — operations API port

The terminal WebSocket lives on the **operations API port** (same origin as
`authStore.getOperationsUrl`), keeping it on the same security boundary as the
rest of the operations surface rather than the application data port. Harper
serves the `/terminal` upgrade from the operations Fastify server
(`server/operationsServer.ts`). `resolveInstanceWsConnection` therefore just
derives `wss://<operations-origin>/terminal` — no port juggling.

## Limitations (shared with existing live features)

- **Direct connections only.** The Fabric Connect proxy buffers streamed
  responses and can't carry a WebSocket, so the page shows an explanatory notice
  when the session is proxied — the same limitation as the live log/deploy tails.
- **super_user only**, gated in the nav, the page, and again on the Harper side.
