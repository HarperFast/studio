import { authStore, EntityIds } from '@/features/auth/store/authStore';
import { AxiosInstance } from 'axios';

/**
 * Response-error interceptor for direct-connect (Fabric Connect Bearer) clients. On a 401, or the 403
 * Harper 5.3 answers an expired token with, the operation token has most likely expired mid-session;
 * recover a fresh one (via the refresh token, falling back to a proxy re-mint) and replay the request
 * once with the new Bearer token. A per-request flag caps this at a single retry so a still-rejected
 * token can't loop.
 *
 * A request is only recovered and replayed on the connection it was sent under. The entity can be
 * disconnected and reconnected as a different user while the request is in flight, and replaying
 * then would run one user's operation as another.
 */
export function curryRecoverExpiredOperationToken(client: Pick<AxiosInstance, 'request'>, id: EntityIds) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return async (error: any) => {
		const config = error?.config;
		if (!isExpiredTokenResponse(error?.response) || !config || config.__triedOperationTokenRefresh) {
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
