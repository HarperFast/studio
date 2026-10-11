import { getCaptchaToken, isCaptchaConfigured, warmCaptcha } from '@/lib/recaptcha/recaptchaScript';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isCaptchaVerificationError } from '../isCaptchaVerificationError';

// A low score comes from network and browser signals that an unchanged resubmit carries again, so
// the copy names what the person can change rather than inviting a plain retry (#1722).
export const CHALLENGE_FAILED =
	"We couldn't verify this request. A VPN, proxy, or strict browser privacy setting can cause this — turn it off for this page, then try again.";
export const CHALLENGE_UNAVAILABLE =
	'We could not run the verification check. Disable any ad blocker for this page, then reload and try again.';

const SUPPORT_AFTER_FAILURES = 2;

// Module scope, not per mount: sign-up and forgot-password are separate routes, and a person refused
// on one often tries the other next (#1722), so the count follows the person, not the form.
let consecutiveFailures = 0;

/** Ends the streak on a success or a non-CAPTCHA failure. Call it from the mutation's own
 *  callbacks, which still run after the form unmounts. */
export function clearCaptchaFailures() {
	consecutiveFailures = 0;
}

/** reCAPTCHA plumbing for the public auth forms (central-manager#627). Fresh
 *  single-use token per submit, so there is no reset or expiry handling.
 *  `alternative` is appended to a rejection: a way forward this form offers that skips the check. */
export function useCaptchaChallenge(action: string, alternative?: string) {
	// Google's terms require the badge to be visible where reCAPTCHA is in use.
	useEffect(() => {
		warmCaptcha();
	}, []);

	// Mint came back empty with a key configured: a later 403 should say the
	// check couldn't run, not ask the user to retry something that can't succeed.
	const mintFailed = useRef(false);
	// Disabling submit during the mint also stops concurrent submits racing
	// mintFailed to the wrong message.
	const [minting, setMinting] = useState(false);

	const getToken = useCallback(async (): Promise<string | undefined> => {
		setMinting(true);
		try {
			const token = await getCaptchaToken(action);
			mintFailed.current = isCaptchaConfigured() && !token;
			return token;
		} finally {
			setMinting(false);
		}
	}, [action]);

	const [supportSuggested, setSupportSuggested] = useState(false);

	const describeCaptchaError = useCallback((error: unknown): string | undefined => {
		if (!isCaptchaVerificationError(error)) {
			consecutiveFailures = 0;
			setSupportSuggested(false);
			return undefined;
		}
		consecutiveFailures += 1;
		setSupportSuggested(consecutiveFailures >= SUPPORT_AFTER_FAILURES);
		const message = mintFailed.current ? CHALLENGE_UNAVAILABLE : CHALLENGE_FAILED;
		return alternative ? `${message} ${alternative}` : message;
	}, [alternative]);

	return { getToken, describeCaptchaError, minting, supportSuggested };
}
