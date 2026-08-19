import { AxiosError } from 'axios';

const CAPTCHA_MARKER = 'verification failed';
// Plain string, Harper's error/message envelopes, or an RFC 9457 title/detail.
const MESSAGE_FIELDS = ['error', 'message', 'title', 'detail'];

/** central-manager's CAPTCHA rejection: 403 + "Verification failed". Every
 *  candidate field is checked, since a mixed envelope can carry a generic
 *  string ("Forbidden") alongside the one that names the real cause. */
export function isCaptchaVerificationError(error: unknown): boolean {
	const response = (error as AxiosError<unknown>)?.response;
	if (response?.status !== 403) { return false; }
	const data = response.data;
	if (typeof data === 'string') { return hasMarker(data); }
	return MESSAGE_FIELDS.some((field) => hasMarker((data as Record<string, unknown>)?.[field]));
}

function hasMarker(value: unknown): boolean {
	return typeof value === 'string' && value.toLowerCase().includes(CAPTCHA_MARKER);
}
