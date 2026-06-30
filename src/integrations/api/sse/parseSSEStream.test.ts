import { describe, expect, it } from 'vitest';
import { parseSSEData, parseSSEStream, SSEMessage } from './parseSSEStream';

function streamFrom(chunks: string[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream({
		start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(encoder.encode(chunk));
			}
			controller.close();
		},
	});
}

async function collect(chunks: string[]): Promise<SSEMessage[]> {
	const out: SSEMessage[] = [];
	for await (const message of parseSSEStream(streamFrom(chunks))) {
		out.push(message);
	}
	return out;
}

describe('parseSSEStream', () => {
	it('parses a single event/data record', async () => {
		const messages = await collect(['event: phase\ndata: {"phase":"prepare"}\n\n']);
		expect(messages).toEqual([{ event: 'phase', data: '{"phase":"prepare"}', id: undefined, retry: undefined }]);
	});

	it('joins multi-line data with newlines', async () => {
		const [message] = await collect(['event: install\ndata: line one\ndata: line two\n\n']);
		expect(message.event).toBe('install');
		expect(message.data).toBe('line one\nline two');
	});

	it('ignores the opening comment line', async () => {
		const messages = await collect([': stream open\n\n', 'event: done\ndata: {"result":1}\n\n']);
		expect(messages).toHaveLength(1);
		expect(messages[0].event).toBe('done');
	});

	it('reassembles records split across chunk boundaries', async () => {
		const messages = await collect(['event: pha', 'se\ndata: {"phase":', '"load"}\n', '\n']);
		expect(messages).toEqual([{ event: 'phase', data: '{"phase":"load"}', id: undefined, retry: undefined }]);
	});

	it('handles CRLF line endings', async () => {
		const [message] = await collect(['event: peer\r\ndata: ok\r\n\r\n']);
		expect(message).toMatchObject({ event: 'peer', data: 'ok' });
	});

	it('surfaces a trailing record with no terminating blank line', async () => {
		const [message] = await collect(['event: done\ndata: {"result":true}']);
		expect(message).toMatchObject({ event: 'done', data: '{"result":true}' });
	});

	it('strips a single leading space after the field colon', async () => {
		const [message] = await collect(['data:  two spaces\n\n']);
		// First space stripped, the second is preserved.
		expect(message.data).toBe(' two spaces');
	});

	it('cancels the underlying stream when the consumer breaks early', async () => {
		let cancelled = false;
		const encoder = new TextEncoder();
		const stream = new ReadableStream<Uint8Array>({
			start(controller) {
				// Enqueue one record but never close — the only way the reader releases is via cancel.
				controller.enqueue(encoder.encode('event: phase\ndata: {"phase":"prepare"}\n\n'));
			},
			cancel() {
				cancelled = true;
			},
		});

		for await (const _message of parseSSEStream(stream)) {
			break; // bail after the first message, like streamOperation does on `done`
		}

		expect(cancelled).toBe(true);
	});

	it('stops early when the signal is already aborted', async () => {
		const controller = new AbortController();
		controller.abort();
		const out: SSEMessage[] = [];
		for await (const message of parseSSEStream(streamFrom(['event: phase\ndata: x\n\n']), controller.signal)) {
			out.push(message);
		}
		expect(out).toHaveLength(0);
	});
});

describe('parseSSEData', () => {
	it('parses JSON payloads', () => {
		expect(parseSSEData({ event: 'done', data: '{"result":{"deployment_id":"d1"}}' })).toEqual({
			result: { deployment_id: 'd1' },
		});
	});

	it('falls back to the raw string for non-JSON payloads', () => {
		expect(parseSSEData({ event: 'install', data: 'npm warn deprecated' })).toBe('npm warn deprecated');
	});
});
