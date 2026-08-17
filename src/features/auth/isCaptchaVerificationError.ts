import { AxiosError } from 'axios';

/** True for central-manager's rejection of a missing/invalid CAPTCHA token
 *  (403 "Verification failed" from src/lib/recaptcha.js). The public auth
 *  endpoints have no other 403, so the status alone would nearly do — the
 *  message check keeps a future 403 on these routes from silently reading as a
 *  failed verification. */
export function isCaptchaVerificationError(error: unknown): boolean {
	const response = (error as AxiosError<unknown>)?.response;
	if (response?.status !== 403) { return false; }
	const data = response.data;
	const message = typeof data === 'string' ? data : firstString(data, ['error', 'message', 'title']);
	return message.toLowerCase().includes('verification failed');
}

// Covers today's plain-string body plus Harper's error/message envelopes and an
// RFC 9457 problem body's title, so a server-side response reshape cannot
// silently downgrade the CAPTCHA guidance to the generic error path.
function firstString(data: unknown, keys: string[]): string {
	for (const key of keys) {
		const value = (data as Record<string, unknown>)?.[key];
		if (typeof value === 'string') { return value; }
	}
	return '';
}
