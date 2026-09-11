import { authStore, EntityIds } from '@/features/auth/store/authStore';
import { AxiosInstance } from 'axios';

/**
 * Response-error interceptor for direct-connect (Fabric Connect Bearer) clients. On a 401 the
 * operation token has most likely expired mid-session; recover a fresh one (via the refresh token,
 * falling back to a proxy re-mint) and replay the request once with the new Bearer token. A per-request
 * flag caps this at a single retry so a still-rejected token can't loop.
 *
 * Clients outlive the token they are built with: `useInstanceClientIdParams` memoizes one per
 * mounted view, keyed on route params.
 */
export function curryRecoverExpiredOperationToken(
	client: Pick<AxiosInstance, 'request'> & { defaults?: { headers?: Record<string, unknown> } },
	id: EntityIds,
) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return async (error: any) => {
		const status = error?.response?.status as number | undefined;
		const config = error?.config;
		if (status !== 401 || !config || config.__triedOperationTokenRefresh) {
			return Promise.reject(error);
		}

		const token = await authStore.recoverExpiredOperationToken(id);
		if (!token) {
			return Promise.reject(error);
		}

		if (authStore.getOperationToken(id) !== token) {
			return Promise.reject(error);
		}

		const authorization = `Bearer ${token}`;
		if (client.defaults?.headers) {
			client.defaults.headers.Authorization = authorization;
		}
		config.__triedOperationTokenRefresh = true;
		config.headers = { ...config.headers, Authorization: authorization };
		return client.request(config);
	};
}
