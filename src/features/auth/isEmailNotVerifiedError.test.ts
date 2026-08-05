import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import { isEmailNotVerifiedError } from './isEmailNotVerifiedError';

// Shapes a rejection the way axios surfaces a central-manager error response.
function axiosError(status: number, data: unknown): AxiosError {
	return { isAxiosError: true, response: { status, data } } as AxiosError;
}

describe('isEmailNotVerifiedError', () => {
	it('matches the 403 "User has not verified email address" rejection (data.error)', () => {
		expect(isEmailNotVerifiedError(axiosError(403, { error: 'User has not verified email address' }))).toBe(true);
	});

	it('matches when the message is under data.message', () => {
		expect(isEmailNotVerifiedError(axiosError(403, { message: 'User has not verified email address' }))).toBe(true);
	});

	it('matches when the body is a bare string', () => {
		expect(isEmailNotVerifiedError(axiosError(403, 'User has not verified email address'))).toBe(true);
	});

	it('matches a nested structured error object', () => {
		expect(isEmailNotVerifiedError(axiosError(403, { error: { message: 'User has not verified email address' } })))
			.toBe(true);
	});

	it('matches a Harper 5 RFC 9457 body (message under data.title)', () => {
		expect(
			isEmailNotVerifiedError(
				axiosError(403, {
					type: 'error:ClientError',
					code: 'ClientError',
					title: 'User has not verified email address',
					status: 403,
					instance: '/Login/',
				}),
			),
		).toBe(true);
	});

	it('does NOT match an RFC 9457 deactivated-account rejection', () => {
		expect(isEmailNotVerifiedError(axiosError(403, { code: 'ClientError', title: 'User account deactivated' })))
			.toBe(false);
	});

	it('does NOT match a 403 deactivated-account rejection (same status, different reason)', () => {
		expect(isEmailNotVerifiedError(axiosError(403, { error: 'User account deactivated' }))).toBe(false);
	});

	it('does NOT match a 401 invalid-credentials rejection', () => {
		expect(isEmailNotVerifiedError(axiosError(401, { error: 'Invalid email or password' }))).toBe(false);
	});

	it('does NOT match a 409 conflict', () => {
		expect(isEmailNotVerifiedError(axiosError(409, { error: 'Multiple user@example.com records found' }))).toBe(false);
	});

	it('is safe on non-axios / empty errors', () => {
		expect(isEmailNotVerifiedError(new Error('Something went wrong'))).toBe(false);
		expect(isEmailNotVerifiedError(undefined)).toBe(false);
		expect(isEmailNotVerifiedError(null)).toBe(false);
		expect(isEmailNotVerifiedError(axiosError(403, undefined))).toBe(false);
	});
});
