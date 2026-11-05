import { readResponseRefusal } from '@/integrations/api/readResponseRefusal';
import { errorText } from '@/lib/errorText';
import { SSEInconclusiveError, SSEOperationError, SSEUnsupportedError } from './errors';
import { parseSSEData, parseSSEStream, SSEMessage } from './parseSSEStream';
import { resolveInstanceConnection, ResolveInstanceConnectionParams } from './resolveInstanceConnection';

export interface StreamOperationOptions {
	/** Connection target — same shape `getInstanceClient`/`resolveInstanceConnection` accept. */
	connection: ResolveInstanceConnectionParams;
	/** Operation body, e.g. `{ operation: 'deploy_component', package, project, ... }`. */
	body: Record<string, unknown>;
	/** Sent after `body` as one `multipart/form-data` request, which Harper streams in rather than buffering. */
	file?: StreamOperationFile;
	/** Caller-owned abort (modal cancel, component unmount). */
	signal?: AbortSignal;
	/**
	 * Abort the stream if no event arrives for this long. A deploy legitimately streams for
	 * minutes, so this is an IDLE timeout (reset per event), not a total-duration cap.
	 * Defaults to 120s.
	 */
	idleTimeoutMs?: number;
	/** Called for every SSE record as it arrives, to drive live UI. */
	onMessage?: (message: SSEMessage) => void;
}

/** 64 KiB/s, a slow uplink: an upload slower than this counts as stalled. */
const UPLOAD_FLOOR_BYTES_PER_MS = 64 * 1024 / 1000;

export interface StreamOperationFile {
	name: string;
	filename: string;
	blob: Blob;
}

/** The start of a value Harper's multipart parser decodes as JSON (harper `multipartParser.ts` `decodeFieldValue`). */
const DECODED_AS_JSON = /^(?:[{["\-0-9]|true$|false$|null$)/;

/**
 * Harper's multipart parser needs every field before the file, and decodes a field that looks like JSON as JSON. So a
 * string that would be misread, such as a project named `123`, goes JSON-encoded too. The browser sets the boundary.
 */
function multipartRequest(body: Record<string, unknown>, file: StreamOperationFile, headers: Record<string, string>) {
	const form = new FormData();
	for (const [name, value] of Object.entries(body)) {
		if (value !== undefined) {
			form.append(name, typeof value === 'string' && !DECODED_AS_JSON.test(value) ? value : JSON.stringify(value));
		}
	}
	form.append(file.name, file.blob, file.filename);
	const multipartHeaders = { ...headers };
	delete multipartHeaders['Content-Type'];
	return { headers: multipartHeaders, body: form };
}

/**
 * Run a Harper operation over SSE and return the final `done` event's `result`.
 *
 * Failure modes are explicit (see `./errors`):
 * - {@link SSEUnsupportedError} — couldn't establish a stream (bad response, wrong
 *   content-type, or connection error before any bytes). A read can fall back to the buffered
 *   axios path; the request may still have reached the server, so a write must check `status`.
 * - {@link SSEOperationError} — a terminal `error` event arrived.
 * - {@link SSEInconclusiveError} — the stream ended (or idled out) without a terminal
 *   event. The outcome is unknown; caller must poll to determine it, never assume success.
 */
export async function streamOperation({
	connection,
	body,
	file,
	signal,
	idleTimeoutMs = 120_000,
	onMessage,
}: StreamOperationOptions): Promise<unknown> {
	const { url, headers, credentials, mode } = resolveInstanceConnection(connection);
	if (file && mode === 'proxy') {
		// Fabric Connect relays JSON bodies of up to 2 MB, and logs each one it relays.
		throw new Error('Sending a file to Harper needs a direct connection, not Fabric Connect.');
	}
	const request = file ? multipartRequest(body, file, headers) : { headers, body: JSON.stringify(body) };
	// `fetch` resolves only once a file has been uploaded, so the wait for the first answer allows for the upload.
	const firstAnswerTimeoutMs = idleTimeoutMs + (file ? Math.ceil(file.blob.size / UPLOAD_FLOOR_BYTES_PER_MS) : 0);

	// Idle watchdog: its own controller aborts the fetch when no event arrives in time. We
	// combine it with the caller's signal so either source can stop the stream, and we can
	// tell them apart afterwards (idle → inconclusive, caller → propagate the abort).
	const idleController = new AbortController();
	const { signal: combinedSignal, cleanup: cleanupSignal } = anySignal([signal, idleController.signal]);

	let idleTimer: ReturnType<typeof setTimeout> | undefined;
	const resetIdleTimer = (timeoutMs = idleTimeoutMs) => {
		if (idleTimer) {
			clearTimeout(idleTimer);
		}
		idleTimer = setTimeout(() => idleController.abort(), timeoutMs);
	};

	try {
		let response: Response;
		try {
			resetIdleTimer(firstAnswerTimeoutMs);
			response = await fetch(url, {
				method: 'POST',
				headers: request.headers,
				credentials,
				body: request.body,
				signal: combinedSignal,
			});
		} catch (error) {
			// The caller aborted deliberately — surface that, don't mask it as "unsupported".
			if (signal?.aborted) {
				throw error;
			}
			// Anything else (network error, DNS, idle before headers) means we never got a stream
			// going, though the request may have been sent: there is no `status` to say otherwise.
			throw new SSEUnsupportedError('Failed to open the SSE stream.', { cause: error });
		}

		const contentType = response.headers.get('content-type') ?? '';
		if (!response.ok || !contentType.includes('text/event-stream') || !response.body) {
			// Read or drain the body so the connection can be reused, then fall back.
			const refusal = response.ok ? undefined : await readResponseRefusal(response);
			await response.body?.cancel().catch(() => {});
			if (signal?.aborted) {
				throw signal.reason;
			}
			throw new SSEUnsupportedError(
				`Server did not return an event stream (status ${response.status}, content-type "${contentType}").`,
				{ status: response.status, refusal },
			);
		}

		let sawTerminal = false;
		let result: unknown;
		try {
			for await (const message of parseSSEStream(response.body, combinedSignal)) {
				resetIdleTimer();
				onMessage?.(message);

				if (message.event === 'done') {
					sawTerminal = true;
					const data = parseSSEData(message);
					result = (data as { result?: unknown } | undefined)?.result ?? data;
					break;
				}
				if (message.event === 'error') {
					sawTerminal = true;
					const data = parseSSEData(message);
					// Guard against a null/primitive payload — accessing .message on it would throw.
					if (!data || typeof data !== 'object') {
						throw new SSEOperationError(typeof data === 'string' && data ? data : 'The operation failed.');
					}
					const err = data as {
						message?: string;
						code?: string | number;
						phase?: string;
						deployment_id?: string;
						certification?: unknown;
					};
					// A non-string message (a structured/nested error object) would stringify to
					// "[object Object]" in every toast that renders it — extract its nested
					// message (or JSON) instead of discarding the detail (#1426).
					throw new SSEOperationError(errorText(err.message) ?? 'The operation failed.', {
						code: err.code,
						phase: err.phase,
						deploymentId: err.deployment_id,
						certification: err.certification,
					});
				}
			}
		} catch (error) {
			// Distinguish an idle-watchdog abort from a deliberate caller abort.
			if (idleController.signal.aborted && !signal?.aborted) {
				throw new SSEInconclusiveError('The stream went idle before completing.', { cause: error });
			}
			throw error;
		}

		if (!sawTerminal) {
			// Stream closed cleanly but never told us how it ended (e.g. a proxy buffered and
			// truncated). The result is genuinely unknown — caller must poll.
			throw new SSEInconclusiveError('The stream ended without a terminal event.');
		}

		return result;
	} finally {
		clearTimeout(idleTimer);
		// Detach the listeners anySignal may have attached to the caller's (possibly long-lived)
		// signal, so short-lived stream calls don't accumulate listeners on it.
		cleanupSignal();
	}
}

/**
 * Combine multiple `AbortSignal`s into one that aborts when any input does, plus a `cleanup`
 * to detach any listeners it attached. Uses the native `AbortSignal.any` when available
 * (modern browsers / Node 20+) — which manages its own listeners — and falls back to manual
 * wiring (with real cleanup) otherwise.
 */
function anySignal(signals: Array<AbortSignal | undefined>): { signal: AbortSignal; cleanup: () => void } {
	const noop = () => {};
	const real = signals.filter((s): s is AbortSignal => !!s);
	if (real.length === 1) {
		return { signal: real[0], cleanup: noop };
	}
	if (typeof AbortSignal.any === 'function') {
		return { signal: AbortSignal.any(real), cleanup: noop };
	}
	const controller = new AbortController();
	// Function declarations (hoisted) so onAbort and cleanup can reference each other.
	function cleanup() {
		for (const s of real) {
			s.removeEventListener('abort', onAbort);
		}
	}
	function onAbort(event: Event) {
		controller.abort((event.target as AbortSignal).reason);
		cleanup();
	}
	for (const s of real) {
		if (s.aborted) {
			controller.abort(s.reason);
			cleanup();
			break;
		}
		s.addEventListener('abort', onAbort);
	}
	return { signal: controller.signal, cleanup };
}
