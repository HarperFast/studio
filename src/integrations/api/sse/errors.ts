/**
 * Distinct failure modes for the browser SSE transport (`streamOperation`). Callers use
 * these to decide whether to retry on the classic buffered axios path or to fall back to
 * polling — never to silently assume success.
 */

/**
 * The server did not (or could not) speak SSE for this request: the response was not OK,
 * arrived without a `text/event-stream` content-type (e.g. an older Harper that ignores
 * the `Accept` header, or a proxy that rewrote it), or the connection failed before any
 * bytes streamed. The caller should fall back to the classic buffered operation.
 */
export class SSEUnsupportedError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = 'SSEUnsupportedError';
	}
}

/**
 * The stream opened and was consumed, but ended without a terminal `done` or `error`
 * event — for example a proxy that buffered then truncated the response, or an idle
 * timeout. The outcome is genuinely unknown, so the caller must determine the real result
 * by polling (`get_deployment` / `get_components`) rather than treating it as success.
 */
export class SSEInconclusiveError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = 'SSEInconclusiveError';
	}
}

/**
 * A terminal `error` event was received over the stream. Carries the structured fields
 * Harper emits so the UI can surface phase/code alongside the message.
 */
export class SSEOperationError extends Error {
	readonly code?: string | number;
	readonly phase?: string;
	readonly deploymentId?: string;

	constructor(message: string, details?: { code?: string | number; phase?: string; deploymentId?: string }) {
		super(message);
		this.name = 'SSEOperationError';
		this.code = details?.code;
		this.phase = details?.phase;
		this.deploymentId = details?.deploymentId;
	}
}
