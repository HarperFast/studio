import { isReadRequest } from '@/integrations/api/isReadOperation';
import { sleep } from '@/lib/sleep';
import { AxiosInstance } from 'axios';

declare module 'axios' {
	interface AxiosRequestConfig {
		/**
		 * Send at most once, even a read. The operations console sets it: its freeform body can name a
		 * component's operation, and a `get_` name from a component is no proof that it only reads.
		 * `package_component` sets it too, a read that rebuilds the whole archive on every attempt.
		 */
		skipGatewayRetry?: boolean;
	}
}

/**
 * Replays a 502/503/504 up to three times, for reads only. None of the three means the request went
 * unapplied — a proxy answers for an upstream that may already have it, and Harper itself answers 503
 * when the worker running an operation exits or overruns — so a write is sent once and its first
 * answer is final.
 */
export function curryRetryGatewayErrors(client: Pick<AxiosInstance, 'request'>) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return async (error: any) => {
		const status = error?.response?.status as number | undefined;
		const config = error?.config;
		if (!config || config.skipGatewayRetry) {
			return Promise.reject(error);
		}

		const shouldRetry = (status === 502 || status === 503 || status === 504) && isReadRequest(config);
		if (!shouldRetry) {
			return Promise.reject(error);
		}

		const maxRetries = 3;
		config.__retryCount = config.__retryCount || 0;
		if (config.__retryCount >= maxRetries) {
			return Promise.reject(error);
		}

		config.__retryCount += 1;

		// 1x, 2x, 4x
		const retryPower = Math.pow(2, config.__retryCount - 1);
		// 5s, 10s, 20s
		const delay = 5_000 * retryPower;
		await sleep(delay);

		return client.request(config);
	};
}
