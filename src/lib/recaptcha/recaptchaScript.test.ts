/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const { siteKey } = vi.hoisted(() => ({ siteKey: { value: 'test-site-key' as string | undefined } }));
vi.mock('@/config/constants', () => ({
	get recaptchaSiteKey() {
		return siteKey.value;
	},
}));

import {
	getCaptchaToken,
	isCaptchaConfigured,
	resetRecaptchaScriptCacheForTests,
	warmCaptcha,
} from './recaptchaScript';

const SCRIPT_SELECTOR = 'script[src^="https://www.google.com/recaptcha/enterprise.js"]';

function injectedScripts() {
	return [...document.querySelectorAll<HTMLScriptElement>(SCRIPT_SELECTOR)];
}

function fakeGrecaptcha(token = 'minted-token') {
	return {
		ready: (callback: () => void) => callback(),
		execute: vi.fn().mockResolvedValue(token),
	};
}

/** The real script sets window.grecaptcha then fires load; jsdom fetches nothing. */
function resolveLatestScript(api = fakeGrecaptcha()) {
	(window as unknown as { grecaptcha?: unknown }).grecaptcha = { enterprise: api };
	injectedScripts().at(-1)!.dispatchEvent(new Event('load'));
	return api;
}

function failLatestScript() {
	injectedScripts().at(-1)!.dispatchEvent(new Event('error'));
}

afterEach(() => {
	resetRecaptchaScriptCacheForTests();
	for (const script of injectedScripts()) { script.remove(); }
	delete (window as unknown as { grecaptcha?: unknown }).grecaptcha;
	siteKey.value = 'test-site-key';
	vi.clearAllMocks();
});

describe('getCaptchaToken', () => {
	it('injects the script once and mints a token for the given action', async () => {
		const pending = getCaptchaToken('signup');
		expect(injectedScripts()).toHaveLength(1);
		expect(injectedScripts()[0].src).toContain('render=test-site-key');

		const api = resolveLatestScript();
		await expect(pending).resolves.toBe('minted-token');
		expect(api.execute).toHaveBeenCalledWith('test-site-key', { action: 'signup' });
	});

	it('resolves undefined without injecting anything when no site key is configured', async () => {
		siteKey.value = undefined;
		await expect(getCaptchaToken('signup')).resolves.toBeUndefined();
		expect(injectedScripts()).toHaveLength(0);
		expect(isCaptchaConfigured()).toBe(false);
	});

	it('resolves undefined when the script cannot load (form submits tokenless)', async () => {
		const pending = getCaptchaToken('signup');
		failLatestScript();
		await expect(pending).resolves.toBeUndefined();
	});

	it('retries the load on the next submit instead of caching the failure', async () => {
		// A cached rejection would be a dead end: with central-manager enforcing, a user
		// whose first script load was blocked could never mint a token.
		const failed = getCaptchaToken('signup');
		failLatestScript();
		await expect(failed).resolves.toBeUndefined();
		// The dead element is removed so the retry gets a fresh one whose load can fire.
		expect(injectedScripts()).toHaveLength(0);

		const retried = getCaptchaToken('signup');
		expect(injectedScripts()).toHaveLength(1);
		resolveLatestScript();
		await expect(retried).resolves.toBe('minted-token');
	});

	it('resolves undefined when execute itself rejects (e.g. invalid site key)', async () => {
		const api = fakeGrecaptcha();
		api.execute = vi.fn().mockRejectedValue(new Error('Invalid site key'));
		const pending = getCaptchaToken('signup');
		resolveLatestScript(api);
		await expect(pending).resolves.toBeUndefined();
	});

	it('resolves undefined when the mint hangs, instead of dead-ending the submit', async () => {
		// Script loaded but Google's token backend unreachable (captive portal,
		// partial block): execute never settles. The submit must still go out —
		// tokenless — matching central-manager's own 3s fail-open.
		vi.useFakeTimers();
		try {
			const api = fakeGrecaptcha();
			api.execute = vi.fn().mockReturnValue(new Promise<string>(() => {}));
			const pending = getCaptchaToken('signup');
			resolveLatestScript(api);
			await vi.advanceTimersByTimeAsync(4000);
			await expect(pending).resolves.toBeUndefined();
		} finally {
			vi.useRealTimers();
		}
	});

	it('shares one script injection across concurrent mints', async () => {
		const first = getCaptchaToken('signup');
		const second = getCaptchaToken('forgot_password');
		expect(injectedScripts()).toHaveLength(1);

		const api = resolveLatestScript();
		await expect(first).resolves.toBe('minted-token');
		await expect(second).resolves.toBe('minted-token');
		expect(api.execute).toHaveBeenCalledTimes(2);
	});
});

describe('warmCaptcha', () => {
	it('starts the script load without minting', async () => {
		warmCaptcha();
		expect(injectedScripts()).toHaveLength(1);
		const api = resolveLatestScript();
		// Let the warm promise settle; no token was requested.
		await Promise.resolve();
		expect(api.execute).not.toHaveBeenCalled();
	});

	it('does nothing when unconfigured, and swallows a failed load', async () => {
		siteKey.value = undefined;
		warmCaptcha();
		expect(injectedScripts()).toHaveLength(0);

		siteKey.value = 'test-site-key';
		warmCaptcha();
		failLatestScript();
		// The rejection must not surface as an unhandled error; a later mint retries.
		await new Promise((resolve) => setTimeout(resolve, 0));
		const retried = getCaptchaToken('signup');
		expect(injectedScripts()).toHaveLength(1);
		resolveLatestScript();
		await expect(retried).resolves.toBe('minted-token');
	});
});
