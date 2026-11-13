import { expect, test } from '@playwright/test';
import { describeSignupRefusal, sentCaptchaToken } from './signupRefusal';

// The bodies central-manager sends, verbatim apart from the title.
const refusal = (title: string) =>
	JSON.stringify({ type: 'error:ClientError', code: 'ClientError', title, status: 403, instance: '/User/' });

test.describe('describeSignupRefusal', () => {
	test('a refused reCAPTCHA token points at the score threshold, not the allowlist', () => {
		const message = describeSignupRefusal(refusal('Verification failed'), true);
		expect(message).toContain('refused the token this page sent');
		expect(message).toContain('RECAPTCHA_MIN_SCORE');
		expect(message).not.toContain('ALLOWLIST_EMAIL_DOMAINS');
	});

	test('a missing reCAPTCHA token says the page never minted one', () => {
		const message = describeSignupRefusal(refusal('Verification failed'), false);
		expect(message).toContain('this page sent none');
		expect(message).not.toContain('RECAPTCHA_MIN_SCORE');
	});

	test('Forbidden points at the email-domain allowlist', () => {
		const message = describeSignupRefusal(refusal('Forbidden'), true);
		expect(message).toContain('ALLOWLIST_EMAIL_DOMAINS');
		expect(message).not.toContain('reCAPTCHA');
	});

	test('anything else reads as a signup regression and keeps what the server said', () => {
		for (const body of [refusal('Account locked'), '<html>403 Forbidden</html>', '']) {
			const message = describeSignupRefusal(body, true);
			expect(message).toContain('likely a signup regression');
			expect(message).toContain(`Server said: ${body.slice(0, 300)}`);
		}
	});
});

test.describe('sentCaptchaToken', () => {
	for (
		const [postData, sent] of [
			[JSON.stringify({ email: 'a@example.test', captchaToken: '03AFcWeA' }), true],
			[JSON.stringify({ email: 'a@example.test', captchaToken: '' }), false],
			[JSON.stringify({ email: 'a@example.test' }), false],
			['not json', false],
			[null, false],
		] as const
	) {
		test(`${postData} -> ${sent}`, () => {
			expect(sentCaptchaToken(postData)).toBe(sent);
		});
	}
});
