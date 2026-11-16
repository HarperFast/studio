import { getOAuthHandoffUrl } from '@/lib/urls/getOAuthSignInUrl';

/**
 * Redeems a sign-in handoff code with the central manager. Harper names the session cookie after
 * the request's `Origin`, so only a request this page makes can create its session; the OAuth
 * callback, a top-level navigation on the CM's origin, cannot. Rejects when the CM refuses the
 * code: invalid, expired or already used (400), or issued for another origin (403).
 */
export async function redeemOAuthHandoff(code: string): Promise<void> {
	const response = await fetch(getOAuthHandoffUrl(), {
		method: 'POST',
		credentials: 'include',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
		body: JSON.stringify({ code }),
	});
	if (!response.ok) {
		throw new Error(`The central manager refused the sign-in handoff (${response.status})`);
	}
}
