import { AxiosError, AxiosHeaders, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';
import { getHarperVersionProbeOptions } from './getRegistrationInfo';

describe('getHarperVersionProbeOptions', () => {
	const params = { entityId: 'instance-1', instanceClient: {} as AxiosInstance };

	it('takes a refusal as the answer: not retried, and marked so the global handler doesn’t toast it', () => {
		const options = getHarperVersionProbeOptions(params);
		const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig;
		const refusal = new AxiosError('Forbidden', AxiosError.ERR_BAD_REQUEST, config, undefined, {
			status: 403,
			statusText: '',
			headers: {},
			config,
			data: { error: 'not authorized' },
		});
		expect(options.meta).toEqual({ refusalIsAnAnswer: true });
		expect(typeof options.retry === 'function' && options.retry(0, refusal)).toBe(false);
		expect(options.queryKey).toEqual(['registration_info', 'instance-1']);
	});
});
