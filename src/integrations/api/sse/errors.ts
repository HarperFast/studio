/**
 * Distinct failure modes for the browser SSE transport (`streamOperation`). Callers use
 * these to decide whether to retry on the classic buffered axios path or to fall back to
 * polling — never to silently assume success.
 */

/**
 * The server did not (or could not) speak SSE for this request: the response was not OK,
 * arrived without a `text/event-stream` content-type (e.g. an older Harper that ignores
 * the `Accept` header, or a proxy that rewrote it), or the connection failed before any
 * bytes streamed. A read can fall back to the classic buffered operation; a write only when
 * `status` shows the server refused it (see `onDeployComponentSubmit`).
 */
export class SSEUnsupportedError extends Error {
	readonly status?: number;

	constructor(message: string, options?: { cause?: unknown; status?: number }) {
		super(message, options);
		this.name = 'SSEUnsupportedError';
		this.status = options?.status;
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
	/** A deploy its canary refused carries the decision here, as sent (Harper 5.4.0+). */
	readonly certification?: unknown;

	constructor(
		message: string,
		details?: { code?: string | number; phase?: string; deploymentId?: string; certification?: unknown },
	) {
		super(message);
		this.name = 'SSEOperationError';
		this.code = details?.code;
		this.phase = details?.phase;
		this.deploymentId = details?.deploymentId;
		this.certification = details?.certification;
	}
}
