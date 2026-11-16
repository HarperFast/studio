/** The statuses and what they mean come from central-manager's `src/resources/Login.js`. */
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

export function describeUnreachableLogin(url: string, errorText: string | undefined): string {
	return `Sign-in to ${new URL(url).origin} got no response (${errorText ?? 'request failed'}), so this browser `
		+ 'could not reach central-manager: an outage, or a proxy or allowlist blocking it.';
}

export function isLoginRequest(method: string, url: string): boolean {
	return method === 'POST' && new URL(url).pathname.endsWith('/Login/');
}
