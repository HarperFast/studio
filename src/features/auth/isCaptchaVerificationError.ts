import { AxiosError } from 'axios';

/** central-manager's CAPTCHA rejection: 403 + "Verification failed". The
 *  message check keeps an unrelated future 403 from reading as a failed check. */
export function isCaptchaVerificationError(error: unknown): boolean {
	const response = (error as AxiosError<unknown>)?.response;
	if (response?.status !== 403) { return false; }
	const data = response.data;
	const message = typeof data === 'string' ? data : firstString(data, ['error', 'message', 'title']);
	return message.toLowerCase().includes('verification failed');
}

// Plain string, Harper error/message envelopes, or an RFC 9457 title.
function firstString(data: unknown, keys: string[]): string {
	for (const key of keys) {
		const value = (data as Record<string, unknown>)?.[key];
		if (typeof value === 'string') { return value; }
	}
	return '';
}
