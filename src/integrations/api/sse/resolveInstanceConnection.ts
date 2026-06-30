import { apiClient } from '@/config/apiClient';
import { authStore, EntityIds, OverallAppSignIn } from '@/features/auth/store/authStore';

export interface ResolveInstanceConnectionParams {
	id?: EntityIds;
	operationsUrl?: string | null;
	port?: number;
	secure?: boolean;
	forceFabricConnect?: boolean;
	disableFabricConnect?: boolean;
}

export interface ResolvedInstanceConnection {
	/** Fully-qualified operations endpoint to POST to. */
	url: string;
	headers: Record<string, string>;
	credentials: RequestCredentials;
}

/**
 * Resolve the operations endpoint, auth headers, and credentials mode for an instance —
 * the `fetch()` equivalent of {@link getInstanceClient}'s axios setup.
 *
 * SSE has to be consumed with `fetch()` + a streaming body reader (axios is XHR-based and
 * buffers the whole response), so we can't reuse the axios client. This mirrors the
 * connection/auth resolution in `src/config/getInstanceClient.ts` (lines 27-54) one-way:
 * `getInstanceClient` is deliberately left untouched so its battle-tested axios path —
 * including the `rejectReplicationFailures` / gateway-retry interceptors that this fetch
 * path intentionally does NOT carry — keeps working for every non-streaming caller.
 *
 * Note this path loses those interceptors; callers recover gateway/cold-start resilience
 * by falling back to the axios path when the stream can't be established.
 */
export function resolveInstanceConnection({
	id = OverallAppSignIn,
	operationsUrl,
	port,
	secure,
	forceFabricConnect,
	disableFabricConnect,
}: ResolveInstanceConnectionParams = {}): ResolvedInstanceConnection {
	let baseURL = operationsUrl || authStore.getOperationsUrl(id);
	if (baseURL) {
		if (port || secure !== undefined) {
			const newURL = new URL(baseURL);
			if (port) {
				newURL.port = String(port);
			}
			if (secure !== undefined) {
				newURL.protocol = secure ? 'https:' : 'http:';
			}
			baseURL = newURL.toString();
		}
	}

	const fabricConnect = !disableFabricConnect && (forceFabricConnect || authStore.checkForFabricConnect(id));
	if (fabricConnect) {
		if (id.startsWith('clu-')) {
			baseURL = apiClient.defaults.baseURL + `/Cluster/${id}/operation`;
		} else if (id.startsWith('ins-')) {
			baseURL = apiClient.defaults.baseURL + `/HDBInstance/${id}/operation`;
		}
	}

	if (!baseURL) {
		throw new Error(`No operations URL is known for "${id}"; cannot open an SSE stream.`);
	}

	const basicAuth = fabricConnect ? undefined : authStore.checkForBasicAuth(id);

	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		Accept: 'text/event-stream',
	};
	if (basicAuth) {
		// btoa is Latin1-only; Harper credentials are ASCII in practice. axios handles
		// UTF-8 internally — if non-ASCII creds ever surface, encode via TextEncoder here.
		headers.Authorization = `Basic ${btoa(`${basicAuth.username}:${basicAuth.password}`)}`;
	}

	return {
		// axios posts to '/', which combineURLs renders as the base with a single trailing
		// slash (e.g. `.../operation/`). Match that exactly so the fabric-connect proxy
		// route resolves the same way it does for the buffered path.
		url: baseURL.replace(/\/+$/, '') + '/',
		headers,
		// Mirror getInstanceClient's `withCredentials: fabricConnect || !basicAuth`.
		credentials: fabricConnect || !basicAuth ? 'include' : 'same-origin',
	};
}
