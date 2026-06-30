export interface SSEMessage {
	event: string;
	data: string;
	id?: string;
	retry?: number;
}

/**
 * Parse a browser `ReadableStream<Uint8Array>` carrying Server-Sent Events into structured
 * messages, one per blank-line-terminated record.
 *
 * Handles the things the wire doesn't guarantee: split `data:` lines, CRLF or LF endings,
 * comment lines (`: stream open`), and arbitrary chunk boundaries (the network does not
 * align chunks to SSE record boundaries). Mirrors Harper's own consumer in
 * `bin/sseConsumer.ts` so client and server agree on framing.
 *
 * Pass an `AbortSignal` to stop early; the underlying reader is always released.
 */
export async function* parseSSEStream(
	body: ReadableStream<Uint8Array>,
	signal?: AbortSignal,
): AsyncGenerator<SSEMessage> {
	const reader = body.getReader();
	const decoder = new TextDecoder('utf-8');
	let buffer = '';
	let completed = false;
	try {
		while (true) {
			if (signal?.aborted) {
				return;
			}
			const { value, done } = await reader.read();
			if (done) {
				completed = true;
				break;
			}
			buffer += decoder.decode(value, { stream: true });
			yield* drainRecords();
		}
		buffer += decoder.decode();
		// A trailing record without a terminating blank line (connection closed mid-flush)
		// is still surfaced, matching the looser behavior browsers exhibit on close.
		if (buffer.trim()) {
			const msg = parseRecord(buffer);
			if (msg) {
				yield msg;
			}
		}
	} finally {
		// If a consumer breaks early (e.g. on a terminal `done` event) or aborts, the stream
		// hasn't drained — cancel it so the underlying network connection is released rather
		// than left open (browsers cap concurrent connections per host).
		if (!completed) {
			void reader.cancel().catch(() => {});
		}
		reader.releaseLock();
	}

	function* drainRecords(): Generator<SSEMessage> {
		while (true) {
			const lfEnd = buffer.indexOf('\n\n');
			const crlfEnd = buffer.indexOf('\r\n\r\n');
			let endIdx = -1;
			let delimLen = 0;
			if (lfEnd !== -1 && (crlfEnd === -1 || lfEnd < crlfEnd)) {
				endIdx = lfEnd;
				delimLen = 2;
			} else if (crlfEnd !== -1) {
				endIdx = crlfEnd;
				delimLen = 4;
			}
			if (endIdx === -1) {
				return;
			}
			const record = buffer.slice(0, endIdx);
			buffer = buffer.slice(endIdx + delimLen);
			const msg = parseRecord(record);
			if (msg) {
				yield msg;
			}
		}
	}
}

function parseRecord(record: string): SSEMessage | null {
	const lines = record.split(/\r?\n/);
	let event = 'message';
	let id: string | undefined;
	let retry: number | undefined;
	const dataLines: string[] = [];
	for (const line of lines) {
		// Blank lines and comments (lines beginning with ':') are ignored per the SSE spec.
		if (line === '' || line.startsWith(':')) {
			continue;
		}
		const colon = line.indexOf(':');
		const field = colon === -1 ? line : line.slice(0, colon);
		let value = colon === -1 ? '' : line.slice(colon + 1);
		// A single leading space after the colon is stripped per spec.
		if (value.startsWith(' ')) {
			value = value.slice(1);
		}
		switch (field) {
			case 'event':
				event = value;
				break;
			case 'data':
				dataLines.push(value);
				break;
			case 'id':
				id = value;
				break;
			case 'retry': {
				const n = Number(value);
				if (Number.isFinite(n)) {
					retry = n;
				}
				break;
			}
		}
	}
	if (dataLines.length === 0 && event === 'message') {
		return null;
	}
	return { event, data: dataLines.join('\n'), id, retry };
}

/** Parse an {@link SSEMessage}'s data payload as JSON, falling back to the raw string. */
export function parseSSEData(message: SSEMessage): unknown {
	try {
		return JSON.parse(message.data);
	} catch {
		return message.data;
	}
}
