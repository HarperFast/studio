import { afterEach, describe, expect, it, vi } from 'vitest';

const connection = vi.hoisted(() => ({ mode: 'direct' as 'direct' | 'proxy' }));

vi.mock('@/integrations/api/sse/resolveInstanceConnection', () => ({
	resolveInstanceConnection: () => ({
		url: 'https://host:9925/',
		headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', Authorization: 'Bearer t' },
		credentials: 'same-origin' as RequestCredentials,
		mode: connection.mode,
	}),
}));

import { fetchComponentArchive } from './packageComponent';

afterEach(() => {
	vi.unstubAllGlobals();
	connection.mode = 'direct';
});

const args = { connection: { id: 'clu-1' as const }, project: 'web', skipNodeModules: true };

describe('fetchComponentArchive', () => {
	it('asks for the streamed archive and returns its bytes', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response('gzip-bytes', { headers: { 'content-type': 'application/gzip' } }),
		);
		vi.stubGlobal('fetch', fetchMock);

		const archive = await fetchComponentArchive(args);

		expect(await archive.text()).toBe('gzip-bytes');
		const init = fetchMock.mock.calls[0][1] as RequestInit & { headers: Record<string, string> };
		expect(JSON.parse(init.body as string)).toEqual({
			operation: 'package_component',
			project: 'web',
			skip_node_modules: true,
			stream: true,
		});
		expect(init.headers.Accept).toBe('application/octet-stream');
		expect(init.headers.Authorization).toBe('Bearer t');
		expect(init.signal).toBeInstanceOf(AbortSignal);
	});

	it('gives up on an archive that never finishes, and on a caller who stops waiting', async () => {
		const fetchMock = vi.fn((_url: string, init: RequestInit) =>
			new Promise((_resolve, reject) => {
				init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
			})
		);
		vi.stubGlobal('fetch', fetchMock);
		const caller = new AbortController();

		const pending = fetchComponentArchive({ ...args, signal: caller.signal }).catch((caught: unknown) => caught);
		caller.abort(new Error('closed'));

		expect(await pending).toMatchObject({ message: 'closed' });
	});

	it('refuses Fabric Connect before any request', async () => {
		connection.mode = 'proxy';
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);

		await expect(fetchComponentArchive(args)).rejects.toThrow('needs a direct connection');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("rejects with Harper's own words when it refuses", async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"Project not found"}', { status: 404 })));

		await expect(fetchComponentArchive(args)).rejects.toMatchObject({
			name: 'HarperRefusalError',
			message: 'Project not found',
		});
	});

	it('rejects a JSON answer, which is the base64 shape it did not ask for', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(new Response('{"payload":"…"}', { headers: { 'content-type': 'application/json' } })),
		);

		await expect(fetchComponentArchive(args)).rejects.toThrow('rather than an archive');
	});
});
