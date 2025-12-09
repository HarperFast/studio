import { sleep } from '@/lib/sleep';
import { AxiosResponse } from 'axios';

export async function axiosRetry<T = unknown, R = AxiosResponse<T>>(
	requestPromise: () => Promise<R>,
	retries = 3,
	msDelayBetweenAttempts = 1000,
): Promise<R> {
	let attempt = 0;
	if (retries <= 0) {
		throw new Error('retries must be greater than 0');
	}
	let lastError: unknown;
	// use for loop to retry 3 times at most
	while (attempt < retries) {
		try {
			return await requestPromise();
		} catch (error) {
			attempt++;
			lastError = error;
			if (attempt === retries) {
				break;
			}
			await sleep(msDelayBetweenAttempts);
		}
	}
	throw lastError;
}
