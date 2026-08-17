import { getCaptchaToken, isCaptchaConfigured, warmCaptcha } from '@/lib/recaptcha/recaptchaScript';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isCaptchaVerificationError } from '../isCaptchaVerificationError';

const CHALLENGE_FAILED = 'Verification failed. Please try again.';
const CHALLENGE_UNAVAILABLE =
	'We could not run the verification check. Disable any ad blocker for this page, then reload and try again.';

/** reCAPTCHA Enterprise plumbing shared by the two public auth forms (central-manager#627).
 *  Call `getToken()` as the form submits and send the result as `captchaToken`;
 *  pass mutation errors through `describeCaptchaError` — it returns the message to
 *  show when the CAPTCHA is what failed, or undefined for every other error.
 *
 *  Every submit mints a fresh token (they are single use and expire in ~2 min), so
 *  there is no widget, no reset, and no expiry handling here by design. */
export function useCaptchaChallenge(action: string) {
	// Google's terms require the badge to be visible where reCAPTCHA is in use.
	useEffect(() => {
		warmCaptcha();
	}, []);

	// Whether the last mint came back empty with a key configured — that means the
	// script or Google is unreachable from this browser, and a later 403 should say
	// so instead of asking the user to retry something that cannot succeed.
	const mintFailed = useRef(false);
	// Surfaced so forms can disable submit during the mint (bounded at ~4s by the
	// script module's timeout); also keeps concurrent submits from racing
	// mintFailed to the wrong error message.
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

	const describeCaptchaError = useCallback((error: unknown): string | undefined => {
		if (!isCaptchaVerificationError(error)) { return undefined; }
		return mintFailed.current ? CHALLENGE_UNAVAILABLE : CHALLENGE_FAILED;
	}, []);

	return { getToken, describeCaptchaError, minting };
}
