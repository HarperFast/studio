import { getCaptchaToken, isCaptchaConfigured, warmCaptcha } from '@/lib/recaptcha/recaptchaScript';
import { onlineManager } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { OfflineSubmitError } from '../failFastOffline';
import { isCaptchaVerificationError } from '../isCaptchaVerificationError';

// A low score comes from network and browser signals that an unchanged resubmit carries again, so
// the copy names what the person can change rather than inviting a plain retry (#1722).
export const CHALLENGE_FAILED =
	"We couldn't verify this request. A VPN, proxy, or strict browser privacy setting can cause this — turn it off for this page, then try again.";
export const CHALLENGE_UNAVAILABLE =
	'We could not run the verification check. Disable any ad blocker for this page, then reload and try again.';
// Central manager answers an expired, a missing and a low-scoring token with the same 403 (its
// `src/lib/recaptcha.js`), so these two come from the client's own mint, and neither counts toward support.
export const CHALLENGE_EXPIRED = 'The verification check expired before it reached us. Please try again.';
export const CHALLENGE_OFFLINE =
	"The verification check couldn't run while you were offline. Check your connection, then try again.";

/** Google: "Each token can be used only once, and it expires after two minutes."
 *  https://docs.cloud.google.com/recaptcha/docs/create-assessment-website */
export const CAPTCHA_TOKEN_LIFETIME_MS = 2 * 60 * 1000;

const SUPPORT_AFTER_FAILURES = 2;

// Module scope, not per mount: sign-up and forgot-password are separate routes, and a person refused
// on one often tries the other next (#1722), so the count follows the person, not the form.
let consecutiveFailures = 0;

/** Ends the streak on a success or a non-CAPTCHA failure, except an offline one, which never reached
 *  the check. Call it from the mutation's own callbacks, which still run after the form unmounts. */
export function clearCaptchaFailures(failure?: unknown) {
	if (!(failure instanceof OfflineSubmitError)) {
		consecutiveFailures = 0;
	}
}

type LastMint = { minted: true; at: number } | { minted: false; offline: boolean };

function uncountedRefusal(mint: LastMint | undefined): string | undefined {
	if (mint?.minted === false) {
		return mint.offline ? CHALLENGE_OFFLINE : undefined;
	}
	// The refusal arrives after central manager checked the token, so one that arrives within the
	// lifetime was checked while the token was valid. One that arrives later may have expired.
	if (mint && Date.now() - mint.at >= CAPTCHA_TOKEN_LIFETIME_MS) {
		return CHALLENGE_EXPIRED;
	}
	return undefined;
}

/** reCAPTCHA plumbing for the public auth forms (central-manager#627). Mints a fresh single-use
 *  token per submit, which the auth mutations send immediately, even offline (`failFastOffline`).
 *  `alternative` is appended to a rejection: a way forward this form offers that skips the check. */
export function useCaptchaChallenge(action: string, alternative?: string) {
	// Google's terms require the badge to be visible where reCAPTCHA is in use.
	useEffect(() => {
		warmCaptcha();
	}, []);

	// What the last mint produced, for the refusal that follows it: `undefined` before any mint and
	// when no key is configured.
	const lastMint = useRef<LastMint>(undefined);
	// Disabling submit during the mint also stops concurrent submits racing
	// lastMint to the wrong message.
	const [minting, setMinting] = useState(false);

	const getToken = useCallback(async (): Promise<string | undefined> => {
		setMinting(true);
		// Check both ends: if the connection comes back during the mint, the tokenless request can still go out.
		const offlineBefore = !onlineManager.isOnline();
		try {
			const token = await getCaptchaToken(action);
			lastMint.current = token
				? { minted: true, at: Date.now() }
				: isCaptchaConfigured()
				? { minted: false, offline: offlineBefore || !onlineManager.isOnline() }
				: undefined;
			return token;
		} finally {
			setMinting(false);
		}
	}, [action]);

	const [supportSuggested, setSupportSuggested] = useState(false);

	const describeCaptchaError = useCallback((error: unknown): string | undefined => {
		if (!isCaptchaVerificationError(error)) {
			clearCaptchaFailures(error);
			setSupportSuggested(false);
			return undefined;
		}
		const mint = lastMint.current;
		const uncounted = uncountedRefusal(mint);
		if (uncounted) {
			setSupportSuggested(false);
			return uncounted;
		}
		consecutiveFailures += 1;
		setSupportSuggested(consecutiveFailures >= SUPPORT_AFTER_FAILURES);
		const message = mint?.minted === false ? CHALLENGE_UNAVAILABLE : CHALLENGE_FAILED;
		return alternative ? `${message} ${alternative}` : message;
	}, [alternative]);

	return { getToken, describeCaptchaError, minting, supportSuggested };
}
