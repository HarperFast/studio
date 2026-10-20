import { isUnansweredWrite } from '@/integrations/api/unansweredWrite';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';

function config(data: unknown, method = 'post'): InternalAxiosRequestConfig {
	return { method, data } as InternalAxiosRequestConfig;
}

function answered(status: number, requestConfig = config({ operation: 'insert' })) {
	return new AxiosError(
		`Request failed with status code ${status}`,
		status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
		requestConfig,
		undefined,
		{ status, statusText: '', data: '<html>Bad Gateway</html>', headers: {}, config: requestConfig },
	);
}

function unanswered(code: string, requestConfig = config({ operation: 'insert' })) {
	return new AxiosError('Network Error', code, requestConfig);
}

describe('isUnansweredWrite', () => {
	it.each([502, 503, 504])('counts a write answered %i', (status) => {
		expect(isUnansweredWrite(answered(status))).toBe(true);
	});

	it.each([AxiosError.ERR_NETWORK, AxiosError.ETIMEDOUT, AxiosError.ECONNABORTED])(
		'counts a write that got no response (%s)',
		(code) => {
			expect(isUnansweredWrite(unanswered(code))).toBe(true);
		},
	);

	it('reads the operation from a body axios already serialized', () => {
		expect(isUnansweredWrite(answered(504, config(JSON.stringify({ operation: 'deploy_component' }))))).toBe(true);
		expect(isUnansweredWrite(answered(504, config(JSON.stringify({ operation: 'describe_all' }))))).toBe(false);
	});

	it('counts a central-manager write, whose body names no operation', () => {
		expect(isUnansweredWrite(answered(504, config({ name: 'my-cluster' })))).toBe(true);
		expect(isUnansweredWrite(unanswered(AxiosError.ERR_NETWORK, config(undefined, 'delete')))).toBe(true);
	});

	it.each([400, 401, 403, 404, 409, 422, 429, 500])('leaves a write answered %i to its own words', (status) => {
		expect(isUnansweredWrite(answered(status))).toBe(false);
	});

	it.each([AxiosError.ERR_CANCELED, AxiosError.ERR_INVALID_URL, AxiosError.ERR_BAD_OPTION, 'ERR_TARGET_RESTARTING'])(
		'leaves a request that never left the browser (%s) alone',
		(code) => {
			expect(isUnansweredWrite(unanswered(code))).toBe(false);
		},
	);

	it('leaves reads alone, whatever happened to them', () => {
		expect(isUnansweredWrite(answered(504, config({ operation: 'get_job' })))).toBe(false);
		expect(isUnansweredWrite(answered(503, config(undefined, 'get')))).toBe(false);
		expect(isUnansweredWrite(unanswered(AxiosError.ECONNABORTED, config({ operation: 'package_component' })))).toBe(
			false,
		);
	});

	it('needs a real AxiosError with the request it describes', () => {
		expect(isUnansweredWrite(new AxiosError('Network Error', AxiosError.ERR_NETWORK))).toBe(false);
		expect(isUnansweredWrite({ isAxiosError: false, code: AxiosError.ERR_NETWORK, config: config({}) })).toBe(false);
		expect(isUnansweredWrite(new Error('Request failed with status code 504'))).toBe(false);
		expect(isUnansweredWrite(undefined)).toBe(false);
		expect(isUnansweredWrite('504')).toBe(false);
	});
});
