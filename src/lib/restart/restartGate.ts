import { isRestarting, waitUntilReachable } from '@/lib/restart/restartTracker';
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

declare module 'axios' {
	interface AxiosRequestConfig {
		/**
		 * Send even while the entity is tracked as restarting. Only the restart itself sets this: its
		 * own `restart` call and the probes that watch for the instance to come back would otherwise
		 * wait on the very restart they are driving.
		 */
		skipRestartGate?: boolean;
	}
}

/**
 * Hold requests to `entityId` while the tracker says this kind of client cannot reach it, and send
 * them once it can: a held request is a query still fetching, where a failed one is an error state,
 * a retry and a toast. The request's own timeout only starts once it is sent. `proxied` is whether
 * the client goes through central manager's operations proxy (see `holdsRequests`).
 *
 * Register after any interceptor that stamps a request at send time (the direct-connect Bearer):
 * axios runs request interceptors last-registered-first, so the stamp then reflects the real send.
 */
export function installRestartGate(
	client: Pick<AxiosInstance, 'interceptors'>,
	entityId: string,
	{ proxied }: { proxied: boolean },
) {
	client.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
		if (!config.skipRestartGate) {
			await waitUntilReachable(entityId, { proxied, signal: config.signal as AbortSignal | undefined });
		}
		return config;
	});
}

const GATEWAY_STATUSES = new Set([502, 503, 504]);

/** A Node network error the host manager relays, through the proxy, as a 500 with its own text. */
const RELAYED_NETWORK_ERROR = /ECONNREFUSED|ECONNRESET|EHOSTUNREACH|ETIMEDOUT|EPIPE|socket hang up/i;

/** Central manager's proxy refusing a target whose status is mid container op. */
const PROXY_REFUSAL = /\b(?:Cluster|Instance) is not active\b|No running instances found/;

function bodyText(data: unknown): string {
	if (typeof data === 'string') { return data; }
	try {
		return JSON.stringify(data) ?? '';
	} catch {
		return '';
	}
}

/**
 * "Couldn't reach it" rather than "it answered no" — what a restart produces, and all that is muted
 * during one: no response, a gateway status, or central manager's proxy saying the same thing (a 500
 * relaying the host manager's connection error, or a 400 refusing a target that is not active —
 * central-manager `Cluster.js` / `HDBInstance.js` `handleProxiedOperation`). A 403, a validation 400
 * or a 500 from Harper itself is a real answer and still reported.
 */
export function isConnectivityFailure(err: unknown): boolean {
	const { response, code } = (err ?? {}) as { response?: { status?: number; data?: unknown }; code?: string };
	if (!response) {
		return code === 'ERR_NETWORK' || code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ERR_CANCELED';
	}
	const status = response.status ?? 0;
	if (GATEWAY_STATUSES.has(status)) { return true; }
	if (status === 500) { return RELAYED_NETWORK_ERROR.test(bodyText(response.data)); }
	if (status === 400) { return PROXY_REFUSAL.test(bodyText(response.data)); }
	return false;
}

/** Keyed to a restarting entity (the two conventions `invalidateEntityQueries` matches) and connectivity-class. */
export function isRestartNoise(err: unknown, queryKey: readonly unknown[]): boolean {
	const [first, second] = queryKey;
	const belongsToRestart = (typeof first === 'string' && isRestarting(first))
		|| (typeof second === 'string' && isRestarting(second));
	return belongsToRestart && isConnectivityFailure(err);
}
