/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { captchaState } = vi.hoisted(() => ({
	captchaState: { configured: true, token: 'minted-token' as string | undefined },
}));
vi.mock('@/lib/recaptcha/recaptchaScript', () => ({
	isCaptchaConfigured: () => captchaState.configured,
	warmCaptcha: vi.fn(),
	getCaptchaToken: async () => captchaState.token,
}));

import {
	CHALLENGE_FAILED,
	CHALLENGE_UNAVAILABLE,
	clearCaptchaFailures,
	useCaptchaChallenge,
} from './useCaptchaChallenge';

const captchaRejection = { isAxiosError: true, response: { status: 403, data: 'Verification failed' } } as AxiosError;
const serverError = { isAxiosError: true, response: { status: 500 } } as AxiosError;

function failWith(hook: { current: ReturnType<typeof useCaptchaChallenge> }, error: unknown) {
	let message: string | undefined;
	act(() => {
		message = hook.current.describeCaptchaError(error);
	});
	return message;
}

beforeEach(() => {
	captchaState.configured = true;
	captchaState.token = 'minted-token';
	clearCaptchaFailures();
});

describe('useCaptchaChallenge', () => {
	it('names what the person can change instead of a bare "try again"', () => {
		const { result } = renderHook(() => useCaptchaChallenge('signup'));

		const message = failWith(result, captchaRejection);

		expect(message).toBe(CHALLENGE_FAILED);
		expect(message).toMatch(/VPN, proxy, or strict browser privacy setting/);
		expect(message).not.toContain('Please try again');
	});

	it('appends the form’s own way past the check to either rejection', async () => {
		const { result } = renderHook(() => useCaptchaChallenge('signup', 'Use OAuth.'));

		expect(failWith(result, captchaRejection)).toBe(`${CHALLENGE_FAILED} Use OAuth.`);

		captchaState.token = undefined;
		await act(() => result.current.getToken());
		expect(failWith(result, captchaRejection)).toBe(`${CHALLENGE_UNAVAILABLE} Use OAuth.`);
	});

	it('carries the failure count from one form to the next', () => {
		const signUp = renderHook(() => useCaptchaChallenge('signup'));
		failWith(signUp.result, captchaRejection);
		failWith(signUp.result, captchaRejection);
		expect(signUp.result.current.supportSuggested).toBe(true);
		signUp.unmount();

		const forgotPassword = renderHook(() => useCaptchaChallenge('forgot_password'));
		expect(forgotPassword.result.current.supportSuggested).toBe(false);
		failWith(forgotPassword.result, captchaRejection);

		expect(forgotPassword.result.current.supportSuggested).toBe(true);
	});

	it('waits for a second consecutive refusal before offering support', () => {
		const { result } = renderHook(() => useCaptchaChallenge('forgot_password'));

		failWith(result, captchaRejection);
		expect(result.current.supportSuggested).toBe(false);
		failWith(result, captchaRejection);
		expect(result.current.supportSuggested).toBe(true);
	});

	it.each([
		['a non-CAPTCHA failure', (hook: ReturnType<typeof useCaptchaChallenge>) => hook.describeCaptchaError(serverError)],
		['a success', () => clearCaptchaFailures()],
	])('starts the count over after %s, on every form', (_label, breakStreak) => {
		const signUp = renderHook(() => useCaptchaChallenge('signup'));
		failWith(signUp.result, captchaRejection);
		failWith(signUp.result, captchaRejection);
		act(() => {
			breakStreak(signUp.result.current);
		});
		signUp.unmount();

		const forgotPassword = renderHook(() => useCaptchaChallenge('forgot_password'));
		failWith(forgotPassword.result, captchaRejection);

		expect(forgotPassword.result.current.supportSuggested).toBe(false);
	});
});
