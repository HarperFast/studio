/**
 * Explains a refused sign-in in terms of the test account's setup on the target. central-manager's
 * `Login` answers 401 alike for an unknown email and a wrong password, and 403 only after the password
 * matched: unverified, deactivated, or a staff account that must use Google.
 */
export function describeLoginRefusal(status: number, body: string): string {
	const said = `Server said: ${body.slice(0, 300)}`;
	if (status === 401) {
		return 'Sign-in returned 401: the target has no account with PLAYWRIGHT_USER_EMAIL, or its password is '
			+ 'not PLAYWRIGHT_USER_PASSWORD. Accounts are per environment, so create the test account on this '
			+ `target or point both secrets at one that exists there. ${said}`;
	}
	if (status === 403) {
		return 'Sign-in returned 403: the password matched, but the account cannot sign in with it (unverified, '
			+ `deactivated, or a staff account that must use Google). ${said}`;
	}
	return `Sign-in returned ${status}, which no credentials or account setup explains, so this is likely a `
		+ `sign-in regression or an outage. ${said}`;
}

export function isLoginRequest(method: string, url: string): boolean {
	return method === 'POST' && new URL(url).pathname.endsWith('/Login/');
}
