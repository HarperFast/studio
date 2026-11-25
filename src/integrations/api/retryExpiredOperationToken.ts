import { authStore, EntityIds } from '@/features/auth/store/authStore';
import { AxiosInstance } from 'axios';

/**
 * Response-error interceptor for direct-connect (Fabric Connect Bearer) clients. On a 401, or the 403
 * Harper 5.3 answers an expired token with, the operation token has most likely expired mid-session;
 * on the 403 that says the token's own user has no role, that user was dropped while its token stayed
 * valid. Either way, recover a fresh token (via the refresh token, falling back to a proxy re-mint)
 * and replay the request once with the new Bearer token. A per-request flag caps this at a single
 * retry so a still-rejected token can't loop.
 *
 * A request is only recovered and replayed on the connection it was sent under. The entity can be
 * disconnected and reconnected as a different user while the request is in flight, and replaying
 * then would run one user's operation as another.
 */
export function curryRecoverExpiredOperationToken(client: Pick<AxiosInstance, 'request'>, id: EntityIds) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return async (error: any) => {
		const config = error?.config;
		if (!config || config.__triedOperationTokenRefresh || !isRecoverableTokenRefusal(error?.response, config)) {
			return Promise.reject(error);
		}

		const generation = config.__connectionGeneration as number | undefined;
		if (generation !== authStore.getConnectionGeneration(id)) {
			return Promise.reject(error);
		}

		const token = await authStore.recoverExpiredOperationToken(id);
		if (!token || generation !== authStore.getConnectionGeneration(id)) {
			return Promise.reject(error);
		}

		config.__triedOperationTokenRefresh = true;
		return client.request(config);
	};
}

function isRecoverableTokenRefusal(
	response: { status?: number; data?: unknown } | undefined,
	config: { headers?: unknown },
): boolean {
	return isExpiredTokenResponse(response) || isDroppedTokenUserResponse(response, presentedToken(config));
}

const TOKEN_EXPIRED = 'token expired';

/**
 * Harper 5.3 answers an expired token with 403 and exactly the message `token expired`, as plain text or
 * a problem-details body; any other 403 is a real refusal, which a replay with a fresh token would only
 * repeat.
 */
export function isExpiredTokenResponse(response: { status?: number; data?: unknown } | undefined): boolean {
	if (response?.status === 401) {
		return true;
	}
	if (response?.status !== 403) {
		return false;
	}
	const data = response.data;
	if (typeof data === 'string') {
		return data.trim() === TOKEN_EXPIRED;
	}
	const body = data as { error?: unknown; title?: unknown; detail?: unknown; message?: unknown } | null | undefined;
	return [body?.error, body?.title, body?.detail, body?.message].includes(TOKEN_EXPIRED);
}

// Harper's `OP_AUTH_PERMS_ERROR` and `USER_HAS_NO_PERMS`, word for word (two spaces included), in
// `utility/errors/commonErrors.ts` (v5.4.2 lines 132 and 152), unchanged from 4.2 through 5.4. If Harper
// rewords them, this recovery stops matching and the pages stay denied until a reload again.
const OP_AUTH_PERMS_ERROR = 'This operation is not authorized due to role restrictions and/or invalid database items';

function userHasNoPerms(username: string): string {
	return `User ${username} has no role or permissions.  Please assign the user a valid role.`;
}

/**
 * Harper still verifies a token whose user was dropped, resolving it to a user with no role, so every
 * operation answers 403 with `USER_HAS_NO_PERMS` naming that user. Only that refusal, naming the user
 * `token` was minted for, counts: a refusal for a user that has a role, or names anyone else, would
 * be repeated for a fresh token.
 */
export function isDroppedTokenUserResponse(
	response: { status?: number; data?: unknown } | undefined,
	token: string | undefined,
): boolean {
	if (response?.status !== 403) {
		return false;
	}
	const username = operationTokenUsername(token);
	if (username === undefined) {
		return false;
	}
	const body = response.data as { error?: unknown; unauthorized_access?: unknown } | null | undefined;
	const refusals = body?.unauthorized_access;
	return body?.error === OP_AUTH_PERMS_ERROR
		&& Array.isArray(refusals)
		&& refusals.length === 1
		&& refusals[0] === userHasNoPerms(username);
}

/**
 * From the request, not the store: the refusal is about the token this request presented, and another
 * request's recovery may already have replaced the store's.
 */
function presentedToken(config: { headers?: unknown }): string | undefined {
	const headers = config.headers as { get?: (name: string) => unknown; Authorization?: unknown } | undefined;
	const value = typeof headers?.get === 'function' ? headers.get('Authorization') : headers?.Authorization;
	return typeof value === 'string' && value.startsWith('Bearer ') ? value.slice('Bearer '.length) : undefined;
}

/** The `username` claim Harper signs into an operation token. Read, not verified: it only picks what to retry. */
function operationTokenUsername(token: string | undefined): string | undefined {
	const payload = token?.split('.')[1];
	if (!payload) {
		return undefined;
	}
	try {
		const binary = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
		const claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))));
		return typeof claims?.username === 'string' ? claims.username : undefined;
	} catch {
		return undefined;
	}
}
