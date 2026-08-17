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

/** Distinguishes "no CAPTCHA in this env" from "expected but couldn't run". */
export function isCaptchaConfigured(): boolean {
	return Boolean(recaptchaSiteKey);
}

let scriptPromise: Promise<GrecaptchaEnterprise> | undefined;

/** Loads enterprise.js once per page (pairs with central-manager's Enterprise
 *  assessments API) and renders the mandatory badge. */
function loadRecaptcha(): Promise<GrecaptchaEnterprise> {
	// Success is cached; failure is not — a blocked load must stay retryable, or
	// an enforcing central-manager locks the user out until a reload.
	scriptPromise ??= injectScript().catch((error: unknown) => {
		scriptPromise = undefined;
		throw error;
	});
	return scriptPromise;
}

/** Starts the load at form mount so the mint doesn't pay the download. */
export function warmCaptcha(): void {
	if (!isCaptchaConfigured()) { return; }
	// Opportunistic: getCaptchaToken retries the load and owns failure behavior.
	void loadRecaptcha().catch(() => {});
}

// A hung mint (captive portal, partial block) must degrade to a tokenless
// submit, not a dead form — mirrors central-manager's 3s assessment abort.
const MINT_TIMEOUT_MS = 4000;

/** Mints one single-use token per submit (tokens expire in ~2 min). Resolves
 *  undefined on any failure so the caller submits tokenless; an enforcing
 *  server 403s that and the form explains via isCaptchaConfigured(). */
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

// A script firing neither load nor error would leave the cached promise
// pending forever, poisoning every later submit.
const LOAD_TIMEOUT_MS = 8000;

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
		// Rejections remove the node so a retry re-injects a fresh element.
		const fail = (message: string) => {
			clearTimeout(loadTimer);
			script.remove();
			reject(new Error(message));
		};
		const loadTimer = setTimeout(() => fail('reCAPTCHA script load timed out'), LOAD_TIMEOUT_MS);
		script.addEventListener('load', () => {
			clearTimeout(loadTimer);
			if (window.grecaptcha?.enterprise) { resolve(window.grecaptcha.enterprise); }
			else { fail('reCAPTCHA script loaded without exposing its API'); }
		});
		script.addEventListener('error', () => fail('reCAPTCHA script failed to load'));
		document.head.appendChild(script);
	});
}

/** Test-only: drops the cached load so each case starts from a clean page. */
export function resetRecaptchaScriptCacheForTests() {
	scriptPromise = undefined;
}
