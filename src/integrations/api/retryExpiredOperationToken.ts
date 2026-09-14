import { authStore, EntityIds } from '@/features/auth/store/authStore';
import { AxiosInstance } from 'axios';

/**
 * Response-error interceptor for direct-connect (Fabric Connect Bearer) clients. On a 401 the
 * operation token has most likely expired mid-session; recover a fresh one (via the refresh token,
 * falling back to a proxy re-mint) and replay the request once with the new Bearer token. A per-request
 * flag caps this at a single retry so a still-rejected token can't loop.
 *
 * A request is only recovered and replayed on the connection it was sent under. The entity can be
 * disconnected and reconnected as a different user while the request is in flight, and replaying
 * then would run one user's operation as another.
 */
export function curryRecoverExpiredOperationToken(client: Pick<AxiosInstance, 'request'>, id: EntityIds) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return async (error: any) => {
		const status = error?.response?.status as number | undefined;
		const config = error?.config;
		if (status !== 401 || !config || config.__triedOperationTokenRefresh) {
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
