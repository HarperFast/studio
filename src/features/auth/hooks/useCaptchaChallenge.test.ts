/**
 * @vitest-environment jsdom
 */
import { onlineManager } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { captchaState } = vi.hoisted(() => ({
	captchaState: {
		configured: true,
		token: 'minted-token' as string | undefined,
		// Runs inside the mint, for a connection that changes while it is in flight.
		duringMint: undefined as (() => void) | undefined,
	},
}));
vi.mock('@/lib/recaptcha/recaptchaScript', () => ({
	isCaptchaConfigured: () => captchaState.configured,
	warmCaptcha: vi.fn(),
	getCaptchaToken: async () => {
		captchaState.duringMint?.();
		return captchaState.token;
	},
}));

import {
	CAPTCHA_TOKEN_LIFETIME_MS,
	CHALLENGE_EXPIRED,
	CHALLENGE_FAILED,
	CHALLENGE_OFFLINE,
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
	captchaState.duringMint = undefined;
	clearCaptchaFailures();
});

afterEach(() => {
	onlineManager.setOnline(true);
	vi.useRealTimers();
});

async function mint(hook: { current: ReturnType<typeof useCaptchaChallenge> }) {
	await act(() => hook.current.getToken());
}

/** Moves the clock past (or short of) the token's lifetime, as of the mint just made. */
function elapse(ms: number) {
	vi.setSystemTime(Date.now() + ms);
}

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

// Central manager refuses an expired or a missing token with the same 403 as a low score, so the
// wording comes from what the hook knows about its own mint (#1930).
describe('useCaptchaChallenge — refusals the person’s network did not cause', () => {
	it('says the check expired, not that a VPN is in the way, for a refusal after the token’s lifetime', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		const { result } = renderHook(() => useCaptchaChallenge('forgot_password', 'Use OAuth.'));
		await mint(result);
		elapse(CAPTCHA_TOKEN_LIFETIME_MS);

		const message = failWith(result, captchaRejection);

		expect(message).toBe(CHALLENGE_EXPIRED);
		expect(message).not.toMatch(/VPN|proxy|ad blocker/);
	});

	// The refusal arrives after the token was checked, so within the lifetime it was valid when checked.
	it('still names the network for a refusal that lands within the token’s lifetime', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		const { result } = renderHook(() => useCaptchaChallenge('forgot_password'));
		await mint(result);
		elapse(CAPTCHA_TOKEN_LIFETIME_MS - 1);

		expect(failWith(result, captchaRejection)).toBe(CHALLENGE_FAILED);
	});

	it('does not count an expired-token refusal toward the support offer, nor reset the count', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		const { result } = renderHook(() => useCaptchaChallenge('signup'));
		await mint(result);
		failWith(result, captchaRejection);

		await mint(result);
		elapse(CAPTCHA_TOKEN_LIFETIME_MS);
		failWith(result, captchaRejection);
		failWith(result, captchaRejection);
		expect(result.current.supportSuggested).toBe(false);

		await mint(result);
		failWith(result, captchaRejection);
		expect(result.current.supportSuggested).toBe(true);
	});

	// The mint can't reach Google offline. If the connection is back by the time the tokenless request
	// goes out, central manager refuses it, and the cause was the connection, not an ad blocker.
	it('says the check could not run offline when the mint came back empty while offline', async () => {
		onlineManager.setOnline(false);
		captchaState.token = undefined;
		captchaState.duringMint = () => onlineManager.setOnline(true);
		const { result } = renderHook(() => useCaptchaChallenge('signup', 'Use OAuth.'));
		await mint(result);

		const message = failWith(result, captchaRejection);

		expect(message).toBe(CHALLENGE_OFFLINE);
		expect(message).not.toMatch(/VPN|proxy|ad blocker/);
		failWith(result, captchaRejection);
		expect(result.current.supportSuggested).toBe(false);
	});

	it('says the check could not run offline when the connection dropped during the mint', async () => {
		captchaState.token = undefined;
		captchaState.duringMint = () => onlineManager.setOnline(false);
		const { result } = renderHook(() => useCaptchaChallenge('forgot_password'));
		await mint(result);

		expect(failWith(result, captchaRejection)).toBe(CHALLENGE_OFFLINE);
	});

	it('keeps the ad-blocker copy for a mint that came back empty while online', async () => {
		captchaState.token = undefined;
		const { result } = renderHook(() => useCaptchaChallenge('forgot_password'));
		await mint(result);

		expect(failWith(result, captchaRejection)).toBe(CHALLENGE_UNAVAILABLE);
	});
});
