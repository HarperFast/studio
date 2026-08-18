import { getCaptchaToken, isCaptchaConfigured, warmCaptcha } from '@/lib/recaptcha/recaptchaScript';
import { useCallback, useEffect, useRef, useState } from 'react';
import { isCaptchaVerificationError } from '../isCaptchaVerificationError';

const CHALLENGE_FAILED = 'Verification failed. Please try again.';
const CHALLENGE_UNAVAILABLE =
	'We could not run the verification check. Disable any ad blocker for this page, then reload and try again.';

// A low score can't be fixed by retrying — the signals behind it don't change —
// so a second failure offers a human instead of repeating "try again" forever.
const SUPPORT_AFTER_FAILURES = 2;

/** reCAPTCHA plumbing for the public auth forms (central-manager#627). Fresh
 *  single-use token per submit, so there is no reset or expiry handling. */
export function useCaptchaChallenge(action: string) {
	// Google's terms require the badge to be visible where reCAPTCHA is in use.
	useEffect(() => {
		warmCaptcha();
	}, []);

	// Mint came back empty with a key configured: a later 403 should say the
	// check couldn't run, not ask the user to retry something that can't succeed.
	const mintFailed = useRef(false);
	// Also stops concurrent submits racing mintFailed to the wrong message.
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

	const consecutiveFailures = useRef(0);
	const [supportSuggested, setSupportSuggested] = useState(false);

	const describeCaptchaError = useCallback((error: unknown): string | undefined => {
		if (!isCaptchaVerificationError(error)) {
			consecutiveFailures.current = 0;
			setSupportSuggested(false);
			return undefined;
		}
		consecutiveFailures.current += 1;
		setSupportSuggested(consecutiveFailures.current >= SUPPORT_AFTER_FAILURES);
		return mintFailed.current ? CHALLENGE_UNAVAILABLE : CHALLENGE_FAILED;
	}, []);

	return { getToken, describeCaptchaError, minting, supportSuggested };
}
