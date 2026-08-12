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
	const message = typeof data === 'string'
		? data
		: typeof (data as { error?: unknown; message?: unknown })?.error === 'string'
		? (data as { error: string }).error
		: typeof (data as { message?: unknown })?.message === 'string'
		? (data as { message: string }).message
		: '';
	return message.toLowerCase().includes('verification failed');
}
