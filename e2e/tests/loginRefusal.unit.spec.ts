import { expect, test } from '@playwright/test';
import { describeLoginRefusal, describeUnreachableLogin, isLoginRequest } from './loginRefusal';

const refusal = (status: number, title: string) =>
	JSON.stringify({ type: 'error:ClientError', code: 'ClientError', title, status, instance: '/Login/' });

test.describe('describeLoginRefusal', () => {
	test('a 401 names the two secrets and that accounts are per environment', () => {
		const message = describeLoginRefusal(401, refusal(401, 'Invalid email or password'));
		expect(message).toContain('PLAYWRIGHT_USER_EMAIL');
		expect(message).toContain('PLAYWRIGHT_USER_PASSWORD');
		expect(message).toContain('per environment');
		expect(message).toContain('Server said: {"type":"error:ClientError"');
	});

	test('a 403 says the password matched and passes on which state refused it', () => {
		const message = describeLoginRefusal(403, refusal(403, 'User has not verified email address'));
		expect(message).toContain('the password matched');
		expect(message).toContain('User has not verified email address');
		expect(message).not.toContain('PLAYWRIGHT_USER_PASSWORD');
	});

	test('any other status points away from the account', () => {
		const message = describeLoginRefusal(500, '<html>Bad gateway</html>');
		expect(message).toContain('Sign-in returned 500');
		expect(message).toContain('regression or an outage');
		expect(message).not.toContain('PLAYWRIGHT_USER_EMAIL');
	});

	test('quotes at most 300 characters of the body', () => {
		const message = describeLoginRefusal(401, 'x'.repeat(1_000));
		expect(message).toContain(`Server said: ${'x'.repeat(300)}`);
		expect(message).not.toContain('x'.repeat(301));
	});
});

test.describe('describeUnreachableLogin', () => {
	test('names the origin and the network error, and points away from the account', () => {
		const message = describeUnreachableLogin('https://cm.example.test/Login/?x=1', 'net::ERR_CONNECTION_REFUSED');
		expect(message).toContain('Sign-in to https://cm.example.test got no response');
		expect(message).toContain('net::ERR_CONNECTION_REFUSED');
		expect(message).not.toContain('/Login/');
		expect(message).not.toContain('PLAYWRIGHT_USER_EMAIL');
	});

	test('still reads when the browser gives no error text', () => {
		expect(describeUnreachableLogin('https://cm.example.test/Login/', undefined)).toContain('(request failed)');
	});
});

test.describe('isLoginRequest', () => {
	for (
		const [method, url, expected] of [
			['POST', 'https://dev.studio.harperfabric.com/Login/', true],
			['POST', 'https://cm.example.test/api/Login/', true],
			['DELETE', 'https://dev.studio.harperfabric.com/Login/', false],
			['GET', 'https://dev.studio.harperfabric.com/Login/', false],
			['POST', 'https://dev.studio.harperfabric.com/Logins/', false],
			['POST', 'https://dev.studio.harperfabric.com/Login/usr-1', false],
			['POST', 'https://dev.studio.harperfabric.com/#/sign-in?next=/Login/', false],
		] as const
	) {
		test(`${method} ${url} -> ${expected}`, () => {
			expect(isLoginRequest(method, url)).toBe(expected);
		});
	}
});
