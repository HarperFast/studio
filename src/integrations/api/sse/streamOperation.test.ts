import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const connection = vi.hoisted(() => ({ mode: 'direct' as 'direct' | 'proxy' }));

vi.mock('./resolveInstanceConnection', () => ({
	resolveInstanceConnection: () => ({
		url: 'https://host:9925/',
		headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
		credentials: 'include' as RequestCredentials,
		mode: connection.mode,
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
	connection.mode = 'direct';
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

	it('falls back (SSEUnsupportedError) when the response is not an event stream, with its status', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(sseResponse('{"message":"ok"}', { contentType: 'application/json' })),
		);

		const error = await streamOperation({ connection: { id: 'ins-1' }, body: { operation: 'deploy_component' } })
			.catch((e: unknown) => e);

		expect(error).toBeInstanceOf(SSEUnsupportedError);
		expect((error as SSEUnsupportedError).status).toBe(200);
	});

	it('reports the status of a response that refused the stream', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(sseResponse('{"error":"Gateway Timeout"}', { status: 504, contentType: 'text/html' })),
		);

		const error = await streamOperation({ connection: { id: 'ins-1' }, body: { operation: 'deploy_component' } })
			.catch((e: unknown) => e);

		expect((error as SSEUnsupportedError).status).toBe(504);
	});

	it('falls back (SSEUnsupportedError) when fetch rejects before streaming, with no status', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));

		const error = await streamOperation({ connection: { id: 'ins-1' }, body: { operation: 'deploy_component' } })
			.catch((e: unknown) => e);

		expect(error).toBeInstanceOf(SSEUnsupportedError);
		expect((error as SSEUnsupportedError).status).toBeUndefined();
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

describe('streamOperation with a file', () => {
	const file = {
		name: 'payload',
		filename: 'package.tar.gz',
		blob: new Blob(['tarball'], { type: 'application/gzip' }),
	};

	it('sends every field before the file, non-strings as JSON, and lets the browser set the boundary', async () => {
		const fetchMock = vi.fn().mockResolvedValue(sseResponse('event: done\ndata: {"result":{"ok":true}}\n\n'));
		vi.stubGlobal('fetch', fetchMock);

		await streamOperation({
			connection: { id: 'clu-1' },
			body: {
				operation: 'deploy_component',
				project: 'web',
				replicated: true,
				branchedDatabases: [],
				skipped: undefined,
			},
			file,
		});

		const init = fetchMock.mock.calls[0][1] as RequestInit & { headers: Record<string, string> };
		expect(init.headers['Content-Type']).toBeUndefined();
		expect(init.headers.Accept).toBe('text/event-stream');
		const form = init.body as FormData;
		expect([...form.keys()]).toEqual(['operation', 'project', 'replicated', 'branchedDatabases', 'payload']);
		expect(form.get('operation')).toBe('deploy_component');
		expect(form.get('replicated')).toBe('true');
		expect(form.get('branchedDatabases')).toBe('[]');
		expect((form.get('payload') as File).name).toBe('package.tar.gz');
	});

	it("JSON-encodes a string Harper's parser would read as JSON, and leaves the rest as they are", async () => {
		const fetchMock = vi.fn().mockResolvedValue(sseResponse('event: done\ndata: {"result":{}}\n\n'));
		vi.stubGlobal('fetch', fetchMock);

		await streamOperation({
			connection: { id: 'clu-1' },
			body: { operation: 'deploy_component', project: '123', other: 'true', quoted: '"x"', plain: 'web-app' },
			file,
		});

		const form = (fetchMock.mock.calls[0][1] as RequestInit).body as FormData;
		expect(form.get('operation')).toBe('deploy_component');
		expect(form.get('project')).toBe('"123"');
		expect(form.get('other')).toBe('"true"');
		expect(form.get('quoted')).toBe('"\\"x\\""');
		expect(form.get('plain')).toBe('web-app');
	});

	it('gives the upload time before the idle watchdog starts counting', async () => {
		vi.useFakeTimers();
		try {
			let aborted = false;
			vi.stubGlobal(
				'fetch',
				vi.fn((_url: string, init: RequestInit) =>
					new Promise((_resolve, reject) => {
						init.signal?.addEventListener('abort', () => {
							aborted = true;
							reject(new DOMException('aborted', 'AbortError'));
						});
					})
				),
			);
			const sixtyFourKibPerSecondFor10s = new Blob([new Uint8Array(64 * 1024 * 10)]);
			const pending = streamOperation({
				connection: { id: 'clu-1' },
				body: { operation: 'deploy_component' },
				file: { ...file, blob: sixtyFourKibPerSecondFor10s },
				idleTimeoutMs: 1_000,
			}).catch((caught: unknown) => caught);

			await vi.advanceTimersByTimeAsync(5_000);
			expect(aborted).toBe(false);
			await vi.advanceTimersByTimeAsync(7_000);
			expect(aborted).toBe(true);
			expect(await pending).toBeInstanceOf(SSEUnsupportedError);
		} finally {
			vi.useRealTimers();
		}
	});

	it('refuses to send a file through Fabric Connect, before any request', async () => {
		connection.mode = 'proxy';
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		await expect(streamOperation({ connection: { id: 'clu-1' }, body: { operation: 'deploy_component' }, file }))
			.rejects.toThrow('needs a direct connection');
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe('streamOperation refusals', () => {
	it('keeps what Harper said when it refuses the request, and its status', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ error: "'system' cannot be branched" }), {
					status: 400,
					headers: { 'content-type': 'application/json' },
				}),
			),
		);

		const error = await streamOperation({ connection: { id: 'ins-1' }, body: { operation: 'deploy_component' } })
			.catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(SSEUnsupportedError);
		expect(error).toMatchObject({ status: 400, refusal: "'system' cannot be branched" });
	});

	it('reads no refusal from a successful answer that is not a stream', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse('{"ok":true}', { contentType: 'application/json' })));

		const error = await streamOperation({ connection: { id: 'ins-1' }, body: { operation: 'deploy_component' } })
			.catch((caught: unknown) => caught);

		expect(error).toMatchObject({ status: 200, refusal: undefined });
	});
});
