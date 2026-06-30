import { SSEInconclusiveError, SSEOperationError, SSEUnsupportedError } from './errors';
import { parseSSEData, parseSSEStream, SSEMessage } from './parseSSEStream';
import { resolveInstanceConnection, ResolveInstanceConnectionParams } from './resolveInstanceConnection';

export interface StreamOperationOptions {
	/** Connection target — same shape `getInstanceClient`/`resolveInstanceConnection` accept. */
	connection: ResolveInstanceConnectionParams;
	/** Operation body, e.g. `{ operation: 'deploy_component', package, project, ... }`. */
	body: Record<string, unknown>;
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

/**
 * Run a Harper operation over SSE and return the final `done` event's `result`.
 *
 * Failure modes are explicit (see `./errors`):
 * - {@link SSEUnsupportedError} — couldn't establish a stream (bad response, wrong
 *   content-type, or connection error before any bytes). Caller should fall back to the
 *   buffered axios path.
 * - {@link SSEOperationError} — a terminal `error` event arrived.
 * - {@link SSEInconclusiveError} — the stream ended (or idled out) without a terminal
 *   event. The outcome is unknown; caller must poll to determine it, never assume success.
 */
export async function streamOperation({
	connection,
	body,
	signal,
	idleTimeoutMs = 120_000,
	onMessage,
}: StreamOperationOptions): Promise<unknown> {
	const { url, headers, credentials } = resolveInstanceConnection(connection);

	// Idle watchdog: its own controller aborts the fetch when no event arrives in time. We
	// combine it with the caller's signal so either source can stop the stream, and we can
	// tell them apart afterwards (idle → inconclusive, caller → propagate the abort).
	const idleController = new AbortController();
	const combinedSignal = anySignal([signal, idleController.signal]);

	let idleTimer: ReturnType<typeof setTimeout> | undefined;
	const resetIdleTimer = () => {
		if (idleTimer) {
			clearTimeout(idleTimer);
		}
		idleTimer = setTimeout(() => idleController.abort(), idleTimeoutMs);
	};

	let response: Response;
	try {
		resetIdleTimer();
		response = await fetch(url, {
			method: 'POST',
			headers,
			credentials,
			body: JSON.stringify(body),
			signal: combinedSignal,
		});
	} catch (error) {
		clearTimeout(idleTimer);
		// The caller aborted deliberately — surface that, don't mask it as "unsupported".
		if (signal?.aborted) {
			throw error;
		}
		// Anything else (network error, DNS, idle before headers) means we never got a
		// stream going; let the caller fall back to the buffered request.
		throw new SSEUnsupportedError('Failed to open the SSE stream.', { cause: error });
	}

	const contentType = response.headers.get('content-type') ?? '';
	if (!response.ok || !contentType.includes('text/event-stream') || !response.body) {
		clearTimeout(idleTimer);
		// Drain the body so the connection can be reused, then fall back.
		await response.body?.cancel().catch(() => {});
		throw new SSEUnsupportedError(
			`Server did not return an event stream (status ${response.status}, content-type "${contentType}").`,
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
				const data = parseSSEData(message) as
					| { message?: string; code?: string | number; phase?: string; deployment_id?: string }
					| string;
				if (typeof data === 'string') {
					throw new SSEOperationError(data || 'The operation failed.');
				}
				throw new SSEOperationError(data.message ?? 'The operation failed.', {
					code: data.code,
					phase: data.phase,
					deploymentId: data.deployment_id,
				});
			}
		}
	} catch (error) {
		// Distinguish an idle-watchdog abort from a deliberate caller abort.
		if (idleController.signal.aborted && !signal?.aborted) {
			throw new SSEInconclusiveError('The stream went idle before completing.', { cause: error });
		}
		throw error;
	} finally {
		clearTimeout(idleTimer);
	}

	if (!sawTerminal) {
		// Stream closed cleanly but never told us how it ended (e.g. a proxy buffered and
		// truncated). The result is genuinely unknown — caller must poll.
		throw new SSEInconclusiveError('The stream ended without a terminal event.');
	}

	return result;
}

/**
 * Combine multiple `AbortSignal`s into one that aborts when any input does. Uses the native
 * `AbortSignal.any` when available (modern browsers / Node 20+) and falls back to manual
 * wiring otherwise.
 */
function anySignal(signals: Array<AbortSignal | undefined>): AbortSignal {
	const real = signals.filter((s): s is AbortSignal => !!s);
	if (real.length === 1) {
		return real[0];
	}
	if (typeof AbortSignal.any === 'function') {
		return AbortSignal.any(real);
	}
	const controller = new AbortController();
	for (const s of real) {
		if (s.aborted) {
			controller.abort(s.reason);
			break;
		}
		s.addEventListener('abort', () => controller.abort(s.reason), { once: true });
	}
	return controller.signal;
}
