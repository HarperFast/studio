import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/api/sse/resolveInstanceConnection', () => ({
	resolveInstanceConnection: () => ({
		url: 'https://ins-1.example.com:9925/',
		headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
		credentials: 'same-origin' as RequestCredentials,
		mode: 'direct',
	}),
}));

import { SSEInconclusiveError } from '@/integrations/api/sse/errors';
import { onDeployComponentSubmit } from './deployComponent';

const live = {
	request: { kind: 'deploy' as const, project: 'my-app', package: 'npm:my-app' },
	entityId: 'ins-1' as const,
	entityType: 'instance' as const,
	useSSE: true,
};

function bufferedClient() {
	return { post: vi.fn().mockResolvedValue({ data: { message: 'Successfully deployed: my-app' } }) };
}

function deploy(client: ReturnType<typeof bufferedClient>) {
	return onDeployComponentSubmit({ ...live, instanceClient: client as never });
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('the live deploy, through the real stream', () => {
	it.each([502, 503, 504])(
		'is not sent again after a %i from a gateway, which may have forwarded it',
		async (status) => {
			vi.stubGlobal(
				'fetch',
				vi.fn().mockResolvedValue(
					new Response('<html>Bad Gateway</html>', {
						status,
						headers: { 'content-type': 'text/html' },
					}),
				),
			);
			const client = bufferedClient();

			await expect(deploy(client)).rejects.toBeInstanceOf(SSEInconclusiveError);
			expect(client.post).not.toHaveBeenCalled();
		},
	);

	it('is not sent again after a 2xx that is not a stream, which means it ran', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(Response.json({ message: 'Successfully deployed: my-app' })),
		);
		const client = bufferedClient();

		await expect(deploy(client)).rejects.toBeInstanceOf(SSEInconclusiveError);
		expect(client.post).not.toHaveBeenCalled();
	});

	it('is not sent again when the connection drops after the request went out', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
		const client = bufferedClient();

		await expect(deploy(client)).rejects.toBeInstanceOf(SSEInconclusiveError);
		expect(client.post).not.toHaveBeenCalled();
	});

	it('is not sent again when no answer arrives within the idle window', async () => {
		vi.useFakeTimers();
		vi.stubGlobal(
			'fetch',
			vi.fn((_url: string, init: RequestInit) =>
				new Promise((_resolve, reject) => {
					init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
				})
			),
		);
		const client = bufferedClient();

		const outcome = deploy(client).catch((e: unknown) => e);
		await vi.advanceTimersByTimeAsync(120_000);

		expect(await outcome).toBeInstanceOf(SSEInconclusiveError);
		expect(client.post).not.toHaveBeenCalled();
	});

	it.each([401, 403])('goes out on the buffered path when Harper refused the stream with a %i', async (status) => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(Response.json({ error: 'Login failed' }, { status })),
		);
		const client = bufferedClient();

		await expect(deploy(client)).resolves.toEqual({ message: 'Successfully deployed: my-app' });
		expect(client.post).toHaveBeenCalledOnce();
	});
});
