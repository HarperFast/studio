/**
 * Names the central-manager check that refused a signup with 403. The allowlist in `User.allowCreate`
 * answers `Forbidden`; reCAPTCHA (`lib/recaptcha.js`) answers `Verification failed` and runs only after
 * the allowlist has passed. Local and dev central-managers skip reCAPTCHA, so a lane that is green
 * there can still be refused on stage.
 */
type SignupRefusalCause = 'captcha' | 'allowlist' | 'other';

// The same shapes Studio's isCaptchaVerificationError reads: a plain string, Harper's error/message
// envelopes, or an RFC 9457 title/detail. reCAPTCHA is checked first, since a mixed envelope can
// carry "Forbidden" beside the message that names the real cause.
const MESSAGE_FIELDS = ['error', 'message', 'title', 'detail'];

export function signupRefusalCause(body: string): SignupRefusalCause {
	const messages = refusalMessages(body).map((message) => message.toLowerCase());
	if (messages.some((message) => message.includes('verification failed'))) { return 'captcha'; }
	if (messages.some((message) => message === 'forbidden')) { return 'allowlist'; }
	return 'other';
}

export function describeSignupRefusal(body: string, captchaTokenSent: boolean): string {
	const said = `Server said: ${body.slice(0, 300)}`;
	switch (signupRefusalCause(body)) {
		case 'captcha':
			return captchaTokenSent
				? "Signup returned 403: central-manager's reCAPTCHA check refused the token this page sent. A "
					+ 'headless browser on a CI runner usually scores below the threshold; on a test environment, set '
					+ `RECAPTCHA_MIN_SCORE to 0 in the target central-manager's Configuration table. ${said}`
				: 'Signup returned 403: central-manager requires a reCAPTCHA token and this page sent none, so '
					+ `the reCAPTCHA script did not load or mint one in this browser. ${said}`;
		case 'allowlist':
			return 'Signup returned 403 Forbidden, most likely the email-domain allowlist. Add the Mailosaur server '
				+ "domain to the target's ALLOWLIST_EMAIL_DOMAINS (or set E2E_ALLOW_SIGNUP_403_SKIP=1 to skip "
				+ `deliberately). ${said}`;
		case 'other':
			return 'Signup returned 403 from neither the email-domain allowlist nor reCAPTCHA, so this is likely '
				+ `a signup regression. ${said}`;
	}
}

/** Reports only whether a token was present, never the token. */
export function sentCaptchaToken(postData: string | null): boolean {
	try {
		const { captchaToken } = JSON.parse(postData ?? '') as { captchaToken?: unknown };
		return typeof captchaToken === 'string' && captchaToken.length > 0;
	} catch {
		return false;
	}
}

function refusalMessages(body: string): string[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch {
		return [body.trim()];
	}
	if (typeof parsed === 'string') { return [parsed.trim()]; }
	if (!parsed || typeof parsed !== 'object') { return []; }
	return MESSAGE_FIELDS
		.map((field) => (parsed as Record<string, unknown>)[field])
		.filter((value): value is string => typeof value === 'string')
		.map((value) => value.trim());
}
