import { SSEOperationError, SSEUnsupportedError } from '@/integrations/api/sse/errors';
import { parseSSEData, parseSSEStream } from '@/integrations/api/sse/parseSSEStream';
import {
	resolveInstanceConnection,
	ResolveInstanceConnectionParams,
} from '@/integrations/api/sse/resolveInstanceConnection';
import { z } from 'zod';
import { buildReadLogBody, ReadLogItem } from './getReadLog';
import { LogFiltersFormSchema } from './logFiltersFormSchema';

export interface StreamReadLogParams {
	/** Connection target — same shape `resolveInstanceConnection` accepts. */
	connection: ResolveInstanceConnectionParams;
	logFilters: z.infer<typeof LogFiltersFormSchema>;
	replicated: boolean;
	/** Caller-owned abort (auto-refresh toggled off, filters changed, component unmount). */
	signal?: AbortSignal;
	/** Called for each log entry as it arrives, to drive the live tail. */
	onEntry: (entry: ReadLogItem) => void;
}

/**
 * Subscribe to `read_log` over SSE — the streaming counterpart to {@link getReadLog}. It
 * sends the same operation body (so the server sees the same filters/slice) but with
 * `Accept: text/event-stream`, and forwards each streamed {@link ReadLogItem} to `onEntry`
 * as it arrives.
 *
 * Unlike `streamOperation` (built for request/response operations that end with a terminal
 * `done` event), a log tail is open-ended: an idle connection is normal — no new lines
 * simply means no events — so there is no idle watchdog here. Teardown is entirely the
 * caller's job via `signal`.
 *
 * Resolution and failure modes:
 * - Resolves (returns) when the stream ends cleanly. That happens when the server sent a
 *   bounded slice and closed (an instance that content-negotiates SSE but does not keep the
 *   subscription open), or emitted a terminal `done`/`end` event. Either way the tail is
 *   over; the caller should resume polling to keep catching new entries.
 * - Throws {@link SSEUnsupportedError} when no stream could be established (bad response,
 *   wrong content-type — e.g. an older Harper that ignores `Accept`, or the buffering proxy
 *   — or a connection error before any bytes). The caller should fall back to polling.
 * - Throws {@link SSEOperationError} when a terminal `error` event arrives.
 * - Re-throws the caller's abort untouched so it is not mistaken for "unsupported".
 */
export async function streamReadLog({
	connection,
	logFilters,
	replicated,
	signal,
	onEntry,
}: StreamReadLogParams): Promise<void> {
	const { url, headers, credentials } = resolveInstanceConnection(connection);

	let response: Response;
	try {
		response = await fetch(url, {
			method: 'POST',
			headers,
			credentials,
			body: JSON.stringify(buildReadLogBody(logFilters, replicated)),
			signal,
		});
	} catch (error) {
		// A deliberate caller abort must surface as-is, not be masked as "unsupported".
		if (signal?.aborted) {
			throw error;
		}
		throw new SSEUnsupportedError('Failed to open the read_log SSE stream.', { cause: error });
	}

	const contentType = response.headers.get('content-type') ?? '';
	if (!response.ok || !contentType.includes('text/event-stream') || !response.body) {
		// Drain the body so the connection can be reused, then fall back to polling.
		await response.body?.cancel().catch(() => {});
		throw new SSEUnsupportedError(
			`read_log did not return an event stream (status ${response.status}, content-type "${contentType}").`,
		);
	}

	for await (const message of parseSSEStream(response.body, signal)) {
		if (message.event === 'error') {
			const data = parseSSEData(message);
			if (!data || typeof data !== 'object') {
				throw new SSEOperationError(typeof data === 'string' && data ? data : 'The log stream failed.');
			}
			const err = data as { message?: string; code?: string | number };
			throw new SSEOperationError(err.message ?? 'The log stream failed.', { code: err.code });
		}
		// A terminal marker (some servers close a bounded stream with one) ends the tail.
		if (message.event === 'done' || message.event === 'end') {
			return;
		}
		for (const entry of coerceReadLogEntries(parseSSEData(message))) {
			onEntry(entry);
		}
	}
}

/**
 * Coerce an SSE record's payload into log entries. Tolerant of the shapes the server may
 * emit for an async-iterable of log lines: a single entry, a batch array, or a native
 * message wrapper whose `value` is the entry (Harper's SSE serializer unwraps that into the
 * `data:` field). Anything without the minimal log-entry shape is dropped.
 */
function coerceReadLogEntries(data: unknown): ReadLogItem[] {
	if (Array.isArray(data)) {
		return data.filter(isReadLogItem);
	}
	return isReadLogItem(data) ? [data] : [];
}

function isReadLogItem(value: unknown): value is ReadLogItem {
	if (!value || typeof value !== 'object') {
		return false;
	}
	const entry = value as Record<string, unknown>;
	// `timestamp` is the one field every log line carries; `level`/`message` pin it as a log
	// entry rather than some other streamed object.
	return typeof entry.timestamp === 'string'
		&& (typeof entry.level === 'string' || typeof entry.message === 'string');
}
