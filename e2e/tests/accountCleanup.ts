import type { APIRequestContext, APIResponse } from '@playwright/test';

const JSON_MEDIA_TYPE = /^application\/(?:[\w.+-]+\+)?json\s*(?:;|$)/i;

/**
 * The central-manager API base that a signup request (`POST <base>User/`) went to.
 *
 * Read off the request rather than assumed to be Playwright's `baseURL`: a localhost target serves
 * only the SPA, and its API lives wherever that dev server's `VITE_CENTRAL_MANAGER_API_URL` points.
 */
export function apiBaseFromSignupUrl(signupUrl: string): URL {
	const url = new URL(signupUrl);
	const prefix = /^(.*\/)User\/?$/.exec(url.pathname)?.[1];
	if (prefix === undefined) {
		throw new Error(
			`Signup request ${url.origin}${url.pathname} is not POST <api>/User/; cannot tell where its API is`,
		);
	}
	return new URL(prefix, url.origin);
}

/**
 * Self-delete the account whose session `request` carries: `GET User/current` for its id, then
 * `DELETE User/{id}`. Resolves with the deleted id; throws with the reason on any failure.
 */
export async function deleteSessionAccount(request: APIRequestContext, apiBase: URL): Promise<string> {
	const currentUrl = new URL('User/current', apiBase).href;
	const current = await readJson(
		await request.get(currentUrl, { headers: { accept: 'application/json' } }),
		`GET ${currentUrl}`,
	);
	const id = typeof current === 'object' && current !== null && 'id' in current ? current.id : undefined;
	if (typeof id !== 'string' || !id) {
		throw new Error(`GET ${currentUrl} returned no account id`);
	}

	const deleteUrl = new URL(`User/${encodeURIComponent(id)}`, apiBase).href;
	const deleted = await request.delete(deleteUrl);
	if (!deleted.ok()) {
		throw new Error(`DELETE ${deleteUrl} -> ${deleted.status()}`);
	}
	return id;
}

async function readJson(response: APIResponse, what: string): Promise<unknown> {
	if (!response.ok()) {
		throw new Error(`${what} -> ${response.status()}`);
	}
	const contentType = response.headers()['content-type'] ?? '';
	if (!JSON_MEDIA_TYPE.test(contentType)) {
		throw new Error(
			`${what} -> ${response.status()} ${
				contentType || '(no content-type)'
			}, not JSON: that is not the central-manager API`,
		);
	}
	return response.json();
}
