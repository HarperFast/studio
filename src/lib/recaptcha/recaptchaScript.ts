import { recaptchaSiteKey } from '@/config/constants';

interface GrecaptchaEnterprise {
	ready: (callback: () => void) => void;
	execute: (siteKey: string, options: { action: string }) => Promise<string>;
}

declare global {
	interface Window {
		grecaptcha?: { enterprise?: GrecaptchaEnterprise };
	}
}

/** Whether a site key is configured — the difference between "no CAPTCHA in this
 *  environment" and "CAPTCHA expected but the script could not run". */
export function isCaptchaConfigured(): boolean {
	return Boolean(recaptchaSiteKey);
}

let scriptPromise: Promise<GrecaptchaEnterprise> | undefined;

/** Loads Google's reCAPTCHA Enterprise script once per page and resolves its
 *  global API. enterprise.js, not api.js: central-manager verifies through the
 *  Enterprise assessments API, and Google's documented pairing for Cloud-console
 *  score keys is enterprise.js + grecaptcha.enterprise.execute. Loading also
 *  renders the mandatory reCAPTCHA badge (bottom-right). */
function loadRecaptcha(): Promise<GrecaptchaEnterprise> {
	// Success is cached so a remount cannot re-inject the script; failure is
	// deliberately NOT cached. Against an enforcing central-manager the token is the
	// user's only way through, so a blocked or flaky load has to stay retryable.
	scriptPromise ??= injectScript().catch((error: unknown) => {
		scriptPromise = undefined;
		throw error;
	});
	return scriptPromise;
}

/** Kick the script load off early (form mount) so the badge is visible and the
 *  submit-time mint doesn't pay the download. No-op when unconfigured. */
export function warmCaptcha(): void {
	if (!isCaptchaConfigured()) { return; }
	void loadRecaptcha().catch(() => {
		// Swallowed: warming is opportunistic. getCaptchaToken retries the load and
		// owns the failure behavior.
	});
}

// Mirrors central-manager's 3s assessment abort: a mint that hangs (script loaded
// but Google's token backend unreachable — captive portal, partial block) must
// degrade to a tokenless submit, not a dead form.
const MINT_TIMEOUT_MS = 4000;

/** Mint a reCAPTCHA token for one submit. Tokens are single use and expire in
 *  two minutes, so this is called at submit time, never at mount.
 *
 *  Resolves undefined when no site key is configured or the script/mint failed or
 *  timed out — the caller submits tokenless. central-manager fails open when it
 *  cannot reach Google, so a blocked script must not lock a real user out; when
 *  the server IS enforcing, its 403 comes back and the form explains the real
 *  problem via isCaptchaConfigured(). */
export async function getCaptchaToken(action: string): Promise<string | undefined> {
	if (!recaptchaSiteKey) { return undefined; }
	try {
		return await Promise.race([
			mintToken(action),
			new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), MINT_TIMEOUT_MS)),
		]);
	} catch {
		return undefined;
	}
}

async function mintToken(action: string): Promise<string> {
	const enterprise = await loadRecaptcha();
	await new Promise<void>((resolve) => enterprise.ready(resolve));
	return enterprise.execute(recaptchaSiteKey, { action });
}

function injectScript(): Promise<GrecaptchaEnterprise> {
	return new Promise<GrecaptchaEnterprise>((resolve, reject) => {
		if (window.grecaptcha?.enterprise) {
			resolve(window.grecaptcha.enterprise);
			return;
		}
		const script = document.createElement('script');
		script.src = `https://www.google.com/recaptcha/enterprise.js?render=${encodeURIComponent(recaptchaSiteKey)}`;
		script.async = true;
		script.defer = true;
		script.addEventListener('load', () => {
			if (window.grecaptcha?.enterprise) { resolve(window.grecaptcha.enterprise); }
			else { reject(new Error('reCAPTCHA script loaded without exposing its API')); }
		});
		script.addEventListener('error', () => {
			// Removed so a retry re-injects rather than finding a dead element whose
			// load event has already come and gone.
			script.remove();
			reject(new Error('reCAPTCHA script failed to load'));
		});
		document.head.appendChild(script);
	});
}

/** Test-only: drops the cached load so each case starts from a clean page. */
export function resetRecaptchaScriptCacheForTests() {
	scriptPromise = undefined;
}
