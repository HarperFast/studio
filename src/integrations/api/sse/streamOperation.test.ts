import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./resolveInstanceConnection', () => ({
	resolveInstanceConnection: () => ({
		url: 'https://host:9925/',
		headers: { Accept: 'text/event-stream' },
		credentials: 'include' as RequestCredentials,
	}),
}));

import { SSEInconclusiveError, SSEOperationError, SSEUnsupportedError } from './errors';
import { SSEMessage } from './parseSSEStream';
import { streamOperation } from './streamOperation';

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

beforeEach(() => {
	vi.restoreAllMocks();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('streamOperation', () => {
	it('resolves with the result from the terminal done event', async () => {
		const messages: SSEMessage[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				sseResponse(
					': stream open\n\n'
						+ 'event: phase\ndata: {"phase":"prepare","status":"start"}\n\n'
						+ 'event: done\ndata: {"result":{"deployment_id":"d1","message":"ok"}}\n\n',
				),
			),
		);

		const result = await streamOperation({
			connection: { id: 'ins-1' },
			body: { operation: 'deploy_component' },
			onMessage: (m) => messages.push(m),
		});

		expect(result).toEqual({ deployment_id: 'd1', message: 'ok' });
		expect(messages.map((m) => m.event)).toEqual(['phase', 'done']);
	});

	it('throws SSEOperationError on a terminal error event', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				sseResponse('event: error\ndata: {"message":"boom","code":500,"phase":"load","deployment_id":"d2"}\n\n'),
			),
		);

		await expect(
			streamOperation({ connection: { id: 'ins-1' }, body: { operation: 'deploy_component' } }),
		).rejects.toMatchObject({
			name: 'SSEOperationError',
			message: 'boom',
			code: 500,
			phase: 'load',
			deploymentId: 'd2',
		});
		expect(SSEOperationError).toBeDefined();
	});

	it('extracts the nested message when the error event message is an object (#1426)', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				sseResponse('event: error\ndata: {"message":{"message":"npm install failed","detail":"E1"},"code":500}\n\n'),
			),
		);

		await expect(
			streamOperation({ connection: { id: 'ins-1' }, body: { operation: 'deploy_component' } }),
		).rejects.toMatchObject({ name: 'SSEOperationError', message: 'npm install failed', code: 500 });
	});

	it('stringifies an object error message with no nested message, never "[object Object]"', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(sseResponse('event: error\ndata: {"message":{"detail":"E1"}}\n\n')),
		);

		await expect(
			streamOperation({ connection: { id: 'ins-1' }, body: { operation: 'deploy_component' } }),
		).rejects.toMatchObject({ name: 'SSEOperationError', message: '{"detail":"E1"}' });
	});

	it('does not crash on a null error payload', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse('event: error\ndata: null\n\n')));

		await expect(
			streamOperation({ connection: { id: 'ins-1' }, body: { operation: 'deploy_component' } }),
		).rejects.toMatchObject({ name: 'SSEOperationError', message: 'The operation failed.' });
	});

	it('falls back (SSEUnsupportedError) when the response is not an event stream', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(sseResponse('{"message":"ok"}', { contentType: 'application/json' })),
		);

		await expect(
			streamOperation({ connection: { id: 'ins-1' }, body: { operation: 'deploy_component' } }),
		).rejects.toBeInstanceOf(SSEUnsupportedError);
	});

	it('falls back (SSEUnsupportedError) when fetch rejects before streaming', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));

		await expect(
			streamOperation({ connection: { id: 'ins-1' }, body: { operation: 'deploy_component' } }),
		).rejects.toBeInstanceOf(SSEUnsupportedError);
	});

	it('throws SSEInconclusiveError when the stream ends without a terminal event', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(sseResponse('event: phase\ndata: {"phase":"prepare","status":"start"}\n\n')),
		);

		await expect(
			streamOperation({ connection: { id: 'ins-1' }, body: { operation: 'deploy_component' } }),
		).rejects.toBeInstanceOf(SSEInconclusiveError);
	});

	it('propagates a caller abort rather than masking it', async () => {
		const controller = new AbortController();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockImplementation((_url, init?: RequestInit) => {
				return Promise.reject(
					Object.assign(new Error('aborted'), { name: 'AbortError', signal: init?.signal }),
				);
			}),
		);
		controller.abort();

		await expect(
			streamOperation({
				connection: { id: 'ins-1' },
				body: { operation: 'deploy_component' },
				signal: controller.signal,
			}),
		).rejects.not.toBeInstanceOf(SSEUnsupportedError);
	});
});
