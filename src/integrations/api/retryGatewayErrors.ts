import { sleep } from '@/lib/sleep';
import { AxiosInstance } from 'axios';

export function curryRetryGatewayErrors(client: Pick<AxiosInstance, 'request'>) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return async (error: any) => {
		const status = error?.response?.status as number | undefined;
		const config = error?.config;
		if (!config) {
			return Promise.reject(error);
		}

		const shouldRetry = status === 502 || status === 503 || status === 504;
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
