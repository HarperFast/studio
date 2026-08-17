import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import { isCaptchaVerificationError } from './isCaptchaVerificationError';

function axiosError(status: number, data: unknown): AxiosError {
	return { isAxiosError: true, response: { status, data } } as AxiosError;
}

describe('isCaptchaVerificationError', () => {
	it("matches central-manager's 403 with a plain-string body", () => {
		expect(isCaptchaVerificationError(axiosError(403, 'Verification failed'))).toBe(true);
	});

	it("matches the same message wrapped in Harper's error/message envelopes", () => {
		expect(isCaptchaVerificationError(axiosError(403, { error: 'Verification failed' }))).toBe(true);
		expect(isCaptchaVerificationError(axiosError(403, { message: 'Verification failed' }))).toBe(true);
	});

	it('matches an RFC 9457 problem body via its title', () => {
		expect(
			isCaptchaVerificationError(axiosError(403, { type: 'about:blank', title: 'Verification failed', status: 403 })),
		).toBe(true);
	});

	it('ignores a 403 that is not the challenge (so it keeps the normal error path)', () => {
		expect(isCaptchaVerificationError(axiosError(403, 'User account deactivated'))).toBe(false);
	});

	it('ignores other statuses, including the duplicate-email 409', () => {
		expect(isCaptchaVerificationError(axiosError(409, 'User already exists'))).toBe(false);
		expect(isCaptchaVerificationError(axiosError(400, 'Verification failed'))).toBe(false);
	});

	it('tolerates non-axios and malformed errors', () => {
		expect(isCaptchaVerificationError(new Error('network down'))).toBe(false);
		expect(isCaptchaVerificationError(undefined)).toBe(false);
		expect(isCaptchaVerificationError(axiosError(403, { error: { nested: true } }))).toBe(false);
	});
});
