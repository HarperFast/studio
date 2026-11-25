import { AxiosError, AxiosHeaders, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';
import { getRegistrationInfoQueryOptions } from './getRegistrationInfo';

const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;

function failedWith(status: number) {
	return new AxiosError('Request failed', AxiosError.ERR_BAD_RESPONSE, config, undefined, {
		status,
		statusText: '',
		headers: {},
		config,
		data: { error: 'refused' },
	});
}

describe('getRegistrationInfoQueryOptions', () => {
	const options = getRegistrationInfoQueryOptions({ entityId: 'instance-1', instanceClient: {} as AxiosInstance });
	// Test QueryClients usually set `retry: false`, which a query-level `retry` overrides, so the predicate is pinned here.
	const retry = options.retry as (failureCount: number, error: unknown) => boolean;

	it('takes a refusal as the answer: not retried, and marked so the global handler doesn’t toast it', () => {
		expect(options.queryKey).toEqual(['registration_info', 'instance-1']);
		expect(options.meta).toEqual({ refusalIsAnAnswer: true });
		expect(retry(0, failedWith(403))).toBe(false);
	});

	it('keeps the default three retries for a failure that may pass', () => {
		for (const error of [failedWith(500), failedWith(502), new AxiosError('Network Error', AxiosError.ERR_NETWORK)]) {
			expect([0, 1, 2, 3].map((failureCount) => retry(failureCount, error))).toEqual([true, true, true, false]);
		}
	});
});
