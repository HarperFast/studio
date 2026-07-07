import { SSEOperationError, SSEUnsupportedError } from '@/integrations/api/sse/errors';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/api/sse/resolveInstanceConnection', () => ({
	resolveInstanceConnection: () => ({
		url: 'https://host:9925/',
		headers: { Accept: 'text/event-stream' },
		credentials: 'include' as RequestCredentials,
	}),
}));

import { ReadLogItem } from './getReadLog';
import { streamReadLog } from './streamReadLog';

function sseResponse(body: string, init?: { status?: number; contentType?: string }): Response {
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new TextEncoder().encode(body));
			controller.close();
		},
	});
	return new Response(stream, {
		status: init?.status ?? 200,
		headers: { 'content-type': init?.contentType ?? 'text/event-stream' },
	});
}

const filters = { limit: '100', level: 'undefined' as const };

function entry(message: string, timestamp = '2026-07-07T00:00:00.000Z'): ReadLogItem {
	return { level: 'info', timestamp, thread: 'main/0', tags: [], node: '', message };
}

function collect() {
	const entries: ReadLogItem[] = [];
	return { entries, onEntry: (e: ReadLogItem) => entries.push(e) };
}

beforeEach(() => {
	vi.restoreAllMocks();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('streamReadLog', () => {
	it('forwards each streamed log entry to onEntry and resolves when the stream ends', async () => {
		const { entries, onEntry } = collect();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				sseResponse(
					': keep-alive\n\n'
						+ `data: ${JSON.stringify(entry('first', '2026-07-07T00:00:01.000Z'))}\n\n`
						+ `data: ${JSON.stringify(entry('second', '2026-07-07T00:00:02.000Z'))}\n\n`,
				),
			),
		);

		await expect(
			streamReadLog({ connection: { id: 'ins-1' }, logFilters: filters, replicated: false, onEntry }),
		).resolves.toBeUndefined();
		expect(entries.map((e) => e.message)).toEqual(['first', 'second']);
	});

	it('unwraps a batch array delivered in a single event', async () => {
		const { entries, onEntry } = collect();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(sseResponse(`data: ${JSON.stringify([entry('a'), entry('b')])}\n\n`)),
		);

		await streamReadLog({ connection: { id: 'ins-1' }, logFilters: filters, replicated: false, onEntry });
		expect(entries.map((e) => e.message)).toEqual(['a', 'b']);
	});

	it('drops records that are not log entries', async () => {
		const { entries, onEntry } = collect();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				sseResponse(
					'data: {"hello":"world"}\n\n'
						+ `data: ${JSON.stringify(entry('real'))}\n\n`,
				),
			),
		);

		await streamReadLog({ connection: { id: 'ins-1' }, logFilters: filters, replicated: false, onEntry });
		expect(entries.map((e) => e.message)).toEqual(['real']);
	});

	it('stops at a terminal done event', async () => {
		const { entries, onEntry } = collect();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				sseResponse(
					`data: ${JSON.stringify(entry('before'))}\n\n`
						+ 'event: done\ndata: {}\n\n'
						+ `data: ${JSON.stringify(entry('after'))}\n\n`,
				),
			),
		);

		await streamReadLog({ connection: { id: 'ins-1' }, logFilters: filters, replicated: false, onEntry });
		expect(entries.map((e) => e.message)).toEqual(['before']);
	});

	it('throws SSEOperationError on a terminal error event', async () => {
		const { onEntry } = collect();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(sseResponse('event: error\ndata: {"message":"boom","code":500}\n\n')),
		);

		await expect(
			streamReadLog({ connection: { id: 'ins-1' }, logFilters: filters, replicated: false, onEntry }),
		).rejects.toMatchObject({ name: 'SSEOperationError', message: 'boom', code: 500 });
		expect(SSEOperationError).toBeDefined();
	});

	it('throws SSEUnsupportedError when the response is not an event stream', async () => {
		const { onEntry } = collect();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(sseResponse('[{"message":"ok"}]', { contentType: 'application/json' })),
		);

		await expect(
			streamReadLog({ connection: { id: 'ins-1' }, logFilters: filters, replicated: false, onEntry }),
		).rejects.toBeInstanceOf(SSEUnsupportedError);
	});

	it('throws SSEUnsupportedError when fetch rejects before streaming', async () => {
		const { onEntry } = collect();
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));

		await expect(
			streamReadLog({ connection: { id: 'ins-1' }, logFilters: filters, replicated: false, onEntry }),
		).rejects.toBeInstanceOf(SSEUnsupportedError);
	});

	it('propagates a caller abort rather than masking it as unsupported', async () => {
		const { onEntry } = collect();
		const controller = new AbortController();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockImplementation((_url, init?: RequestInit) =>
				Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError', signal: init?.signal }))
			),
		);
		controller.abort();

		await expect(
			streamReadLog({
				connection: { id: 'ins-1' },
				logFilters: filters,
				replicated: false,
				signal: controller.signal,
				onEntry,
			}),
		).rejects.not.toBeInstanceOf(SSEUnsupportedError);
	});
});
