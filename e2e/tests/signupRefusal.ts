/**
 * Names the central-manager check that refused a signup with 403. The allowlist in `User.allowCreate`
 * answers `Forbidden`; reCAPTCHA (`lib/recaptcha.js`) answers `Verification failed` and runs only after
 * the allowlist has passed. Local and dev central-managers skip reCAPTCHA, so a lane that is green
 * there can still be refused on stage.
 */
export function describeSignupRefusal(body: string, captchaTokenSent: boolean): string {
	const said = `Server said: ${body.slice(0, 300)}`;
	switch (problemTitle(body)) {
		case 'Verification failed':
			return captchaTokenSent
				? "Signup returned 403: central-manager's reCAPTCHA check refused the token this page sent. A "
					+ 'headless browser on a CI runner usually scores below the threshold; on a test environment, set '
					+ `RECAPTCHA_MIN_SCORE to 0 in the target central-manager's Configuration table. ${said}`
				: 'Signup returned 403: central-manager requires a reCAPTCHA token and this page sent none, so '
					+ `the reCAPTCHA script did not load or mint one in this browser. ${said}`;
		case 'Forbidden':
			return 'Signup returned 403 Forbidden, most likely the email-domain allowlist. Add the Mailosaur server '
				+ "domain to the target's ALLOWLIST_EMAIL_DOMAINS (or set E2E_ALLOW_SIGNUP_403_SKIP=1 to skip "
				+ `deliberately). ${said}`;
		default:
			return 'Signup returned 403 from neither the email-domain allowlist nor reCAPTCHA, so this is likely '
				+ `a signup regression. ${said}`;
	}
}

/** Whether the signup request carried a reCAPTCHA token; the token itself is never reported. */
export function sentCaptchaToken(postData: string | null): boolean {
	try {
		const { captchaToken } = JSON.parse(postData ?? '') as { captchaToken?: unknown };
		return typeof captchaToken === 'string' && captchaToken.length > 0;
	} catch {
		return false;
	}
}

function problemTitle(body: string): unknown {
	try {
		return (JSON.parse(body) as { title?: unknown }).title;
	} catch {
		return undefined;
	}
}
