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
	/**
	 * `'direct'` = talking straight to the instance (Bearer/Basic/cookie) — SSE streams.
	 * `'proxy'` = routed through the central-manager fabric-connect proxy, which buffers
	 * `text/event-stream`, so live streaming is not available on this connection.
	 */
	mode: 'direct' | 'proxy';
}

/**
 * Resolve the operations endpoint, auth headers, and credentials mode for an instance —
 * the `fetch()` equivalent of {@link getInstanceClient}'s axios setup.
 *
 * SSE has to be consumed with `fetch()` + a streaming body reader (axios is XHR-based and
 * buffers the whole response), so we can't reuse the axios client. This mirrors the
 * connection/auth resolution in `src/config/getInstanceClient.ts` one-way: `getInstanceClient`
 * is deliberately left untouched so its battle-tested axios path — including the
 * `rejectReplicationFailures` / gateway-retry interceptors that this fetch path intentionally
 * does NOT carry — keeps working for every non-streaming caller. Callers recover gateway/
 * cold-start resilience by falling back to the axios path when the stream can't be established.
 *
 * Fabric Connect now resolves to a direct Bearer (operation token) connection when it can
 * (see authStore.establishFabricConnectAuth); we prefer that so SSE streams straight from
 * the instance instead of through the buffering proxy. Only genuinely proxy-only connections
 * get the `/Cluster|/HDBInstance/{id}/operation` proxy URL and `mode: 'proxy'`.
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

	const basicAuth = authStore.checkForBasicAuth(id);
	// Prefer a direct operation token (Bearer) unless basic auth is present or the proxy is
	// forced — matching getInstanceClient's precedence. When the Fabric Connect flag is set
	// and no token has been minted yet, the proxy still wins over any stale basic-auth entry
	// (again mirroring getInstanceClient), so `fabricConnect` intentionally ignores basicAuth.
	const operationToken = forceFabricConnect || disableFabricConnect || basicAuth
		? undefined
		: authStore.getOperationToken(id);
	const fabricConnect = !operationToken && !disableFabricConnect
		&& (forceFabricConnect || authStore.checkForFabricConnect(id));
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

	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		Accept: 'text/event-stream',
	};
	if (operationToken) {
		headers.Authorization = `Bearer ${operationToken}`;
	} else if (basicAuth && !fabricConnect) {
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
		// Mirror getInstanceClient's `withCredentials: fabricConnect || (!basicAuth && !operationToken)`.
		credentials: fabricConnect || (!basicAuth && !operationToken) ? 'include' : 'same-origin',
		mode: fabricConnect ? 'proxy' : 'direct',
	};
}
