import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./deployComponentStream', () => ({
	deployComponentStream: vi.fn(),
}));

import { SSEOperationError, SSEUnsupportedError } from '@/integrations/api/sse/errors';
import { onDeployComponentSubmit } from './deployComponent';
import { deployComponentStream } from './deployComponentStream';

const mockStream = vi.mocked(deployComponentStream);

function fakeClient(data: unknown) {
	return { post: vi.fn().mockResolvedValue({ data }) };
}

const baseArgs = {
	applicationName: 'my-app',
	applicationUrl: 'npm:my-app',
	entityId: 'ins-1' as const,
	entityType: 'instance' as const,
};

afterEach(() => {
	vi.clearAllMocks();
});

describe('onDeployComponentSubmit', () => {
	it('uses the buffered axios path when SSE is not requested', async () => {
		const client = fakeClient({ message: 'buffered' });
		const result = await onDeployComponentSubmit({
			...baseArgs,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			instanceClient: client as any,
		});
		expect(result).toEqual({ message: 'buffered' });
		expect(client.post).toHaveBeenCalledOnce();
		expect(mockStream).not.toHaveBeenCalled();
	});

	it('returns the streamed result when SSE succeeds', async () => {
		mockStream.mockResolvedValue({ message: 'streamed', deployment_id: 'd1' });
		const client = fakeClient({ message: 'buffered' });
		const result = await onDeployComponentSubmit({
			...baseArgs,
			useSSE: true,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			instanceClient: client as any,
		});
		expect(result).toEqual({ message: 'streamed', deployment_id: 'd1' });
		// SSE succeeded → must NOT also POST (no double-deploy).
		expect(client.post).not.toHaveBeenCalled();
	});

	it('falls back to the buffered path when the stream is unsupported', async () => {
		mockStream.mockRejectedValue(new SSEUnsupportedError('no stream'));
		const client = fakeClient({ message: 'buffered' });
		const result = await onDeployComponentSubmit({
			...baseArgs,
			useSSE: true,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			instanceClient: client as any,
		});
		expect(result).toEqual({ message: 'buffered' });
		expect(client.post).toHaveBeenCalledOnce();
	});

	it('rethrows a deploy failure without re-POSTing (no double deploy)', async () => {
		mockStream.mockRejectedValue(new SSEOperationError('deploy failed'));
		const client = fakeClient({ message: 'buffered' });
		await expect(
			onDeployComponentSubmit({
				...baseArgs,
				useSSE: true,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				instanceClient: client as any,
			}),
		).rejects.toBeInstanceOf(SSEOperationError);
		expect(client.post).not.toHaveBeenCalled();
	});
});
