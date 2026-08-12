import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import { isEmailAlreadyRegisteredError } from './isEmailAlreadyRegisteredError';

// Shapes a rejection the way axios surfaces a central-manager error response.
function axiosError(status: number, data?: unknown): AxiosError {
	return { isAxiosError: true, response: { status, data } } as AxiosError;
}

describe('isEmailAlreadyRegisteredError', () => {
	it('matches a 409 whatever the body says (Harper 4 `error`)', () => {
		expect(isEmailAlreadyRegisteredError(axiosError(409, { error: 'User already exists' }))).toBe(true);
	});

	it('matches a Harper 5 RFC 9457 409 body', () => {
		expect(
			isEmailAlreadyRegisteredError(
				axiosError(409, { type: 'error:ConflictError', code: 'ConflictError', status: 409, instance: '/User/' }),
			),
		).toBe(true);
	});

	it('matches a 409 with no body at all', () => {
		expect(isEmailAlreadyRegisteredError(axiosError(409))).toBe(true);
	});

	it('does NOT match other rejections the sign-up form can see', () => {
		expect(isEmailAlreadyRegisteredError(axiosError(400, { error: 'Invalid password' }))).toBe(false);
		expect(isEmailAlreadyRegisteredError(axiosError(403, { error: 'Forbidden' }))).toBe(false);
		expect(isEmailAlreadyRegisteredError(axiosError(500))).toBe(false);
	});

	it('is safe on non-axios / empty errors', () => {
		expect(isEmailAlreadyRegisteredError(new Error('Something went wrong'))).toBe(false);
		expect(isEmailAlreadyRegisteredError(undefined)).toBe(false);
	});
});
