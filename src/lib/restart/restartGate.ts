import { getRestartState, holdsRequests, isRestarting, waitUntilReachable } from '@/lib/restart/restartTracker';
import { AxiosError, type AxiosInstance, CanceledError, type InternalAxiosRequestConfig } from 'axios';

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

export const RESTARTING_ERROR_CODE = 'ERR_TARGET_RESTARTING';

/**
 * Operations safe to send minutes late: reads, by Harper's naming. Token minting is deliberately not
 * one — held, it would stall a route guard's Fabric Connect attempt behind a notice that cannot mount
 * yet; refused, the guard falls through to sign-in at once.
 */
const SAFE_TO_DELAY =
	/^(?:get_|search_|describe_|list_|read_|user_info$|system_information$|cluster_status$|registration_info$)/;

function operationOf(data: unknown): unknown {
	if (typeof data !== 'string') {
		return (data as { operation?: unknown } | undefined)?.operation;
	}
	// A gateway retry re-sends the config axios already serialized.
	try {
		return (JSON.parse(data) as { operation?: unknown } | null)?.operation;
	} catch {
		return undefined;
	}
}

function isSafeToDelay(config: InternalAxiosRequestConfig): boolean {
	if (config.method?.toLowerCase() === 'get') { return true; }
	const operation = operationOf(config.data);
	return typeof operation === 'string' && SAFE_TO_DELAY.test(operation);
}

/**
 * While the tracker says this kind of client cannot reach `entityId`, hold its reads and send them
 * once it can — a held read is a query still fetching, where a failed one is an error state, a retry
 * and a toast; its own timeout only starts once it is sent. Anything else is refused at once: a write
 * queued for minutes can land after the user has given up on it, or retried it. `proxied` is whether
 * the client goes through central manager's operations proxy (see `holdsRequests`).
 *
 * Register after any interceptor that stamps a request at send time (the direct-connect Bearer):
 * axios runs request interceptors last-registered-first, so the stamp then reflects the real send.
 * `runWhen` skips the interceptor outright while nothing is held, which keeps axios on its
 * synchronous path for every ordinary request.
 */
export function installRestartGate(
	client: Pick<AxiosInstance, 'interceptors'>,
	entityId: string,
	{ proxied }: { proxied: boolean },
) {
	client.interceptors.request.use(
		(config: InternalAxiosRequestConfig) => {
			if (!isSafeToDelay(config)) {
				const target = entityId.startsWith('clu-') ? 'This cluster' : 'This instance';
				throw new AxiosError(
					`${target} is restarting. Try again once it's back online.`,
					RESTARTING_ERROR_CODE,
					config,
				);
			}
			const signal = config.signal as AbortSignal | undefined;
			return waitUntilReachable(entityId, { proxied, signal }).then(() => config, (err: unknown) => {
				// Abandoned before it was sent: reject the way axios would, so `axios.isCancel` knows it.
				throw signal?.aborted ? new CanceledError(undefined, undefined, config) : err;
			});
		},
		undefined,
		{
			runWhen: (config) => !config.skipRestartGate && holdsRequests(getRestartState(entityId), { proxied }),
		},
	);
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
		return code === 'ERR_NETWORK' || code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ERR_CANCELED'
			|| code === RESTARTING_ERROR_CODE;
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
