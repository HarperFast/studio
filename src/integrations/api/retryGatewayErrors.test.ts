import { curryRetryGatewayErrors } from '@/integrations/api/retryGatewayErrors';
import * as sleepModule from '@/lib/sleep';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/sleep', () => ({
	sleep: vi.fn().mockResolvedValue(true),
}));

describe('curryRetryGatewayErrors', () => {
	let client: Pick<AxiosInstance, 'request'>;

	beforeEach(() => {
		vi.clearAllMocks();
		client = {
			request: vi.fn().mockResolvedValue({ ok: true }),
		} as Pick<AxiosInstance, 'request'>;
	});

	it('should be defined and return a function', () => {
		const handler = curryRetryGatewayErrors(client);
		expect(handler).toBeDefined();
		expect(typeof handler).toBe('function');
	});

	it('rejects if error has no config', async () => {
		const handler = curryRetryGatewayErrors(client);
		const err = { response: { status: 502 } } as unknown as { config?: AxiosRequestConfig };

		await expect(handler(err)).rejects.toBe(err);
		expect(sleepModule.sleep).not.toHaveBeenCalled();
		expect(client.request).not.toHaveBeenCalled();
	});

	it('rejects and does not retry for non-gateway status codes', async () => {
		const handler = curryRetryGatewayErrors(client);
		const config: AxiosRequestConfig & { __retryCount?: number } = {};
		const err = { response: { status: 500 }, config };

		await expect(handler(err)).rejects.toBe(err);
		expect(sleepModule.sleep).not.toHaveBeenCalled();
		expect(client.request).not.toHaveBeenCalled();
		// Should not mutate retry count
		expect(config.__retryCount).toBeUndefined();
	});

	it('retries on 502 and increments __retryCount with initial delay on first retry', async () => {
		const handler = curryRetryGatewayErrors(client);
		const config: AxiosRequestConfig & { __retryCount?: number } = {};
		const err = { response: { status: 502 }, config };

		const result = await handler(err);

		expect(sleepModule.sleep).toHaveBeenCalledTimes(1);
		expect(sleepModule.sleep).toHaveBeenCalledWith(5_000);
		expect(config.__retryCount).toBe(1);
		expect(client.request).toHaveBeenCalledTimes(1);
		expect(client.request).toHaveBeenCalledWith(config);
		expect(result).toEqual({ ok: true });
	});

	it('retries on 503 with exponential backoff: more backoff on second retry', async () => {
		const handler = curryRetryGatewayErrors(client);
		const config: AxiosRequestConfig & { __retryCount?: number } = { __retryCount: 1 };
		const err = { response: { status: 503 }, config };

		await handler(err);

		expect(sleepModule.sleep).toHaveBeenCalledTimes(1);
		expect(sleepModule.sleep).toHaveBeenCalledWith(10_000);
		expect(config.__retryCount).toBe(2);
		expect(client.request).toHaveBeenCalledTimes(1);
	});

	it('retries on 504 with the largest backoff on third retry', async () => {
		const handler = curryRetryGatewayErrors(client);
		const config: AxiosRequestConfig & { __retryCount?: number } = { __retryCount: 2 };
		const err = { response: { status: 504 }, config };

		await handler(err);

		expect(sleepModule.sleep).toHaveBeenCalledTimes(1);
		expect(sleepModule.sleep).toHaveBeenCalledWith(20_000);
		expect(config.__retryCount).toBe(3);
		expect(client.request).toHaveBeenCalledTimes(1);
	});

	it('stops retrying when max retries reached (>= 3)', async () => {
		const handler = curryRetryGatewayErrors(client);
		const config: AxiosRequestConfig & { __retryCount?: number } = { __retryCount: 3 };
		const err = { response: { status: 502 }, config };

		await expect(handler(err)).rejects.toBe(err);
		expect(sleepModule.sleep).not.toHaveBeenCalled();
		expect(client.request).not.toHaveBeenCalled();
		// Should not change the retry count when rejecting due to max retries
		expect(config.__retryCount).toBe(3);
	});
});
