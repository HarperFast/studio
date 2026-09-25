import { apiClient } from '@/config/apiClient';
import { authStore, EntityIds, OverallAppSignIn } from '@/features/auth/store/authStore';
import { rejectReplicationFailures } from '@/integrations/api/replication';
import { curryRecoverExpiredOperationToken } from '@/integrations/api/retryExpiredOperationToken';
import { curryRetryGatewayErrors } from '@/integrations/api/retryGatewayErrors';
import { installRestartGate } from '@/lib/restart/restartGate';
import axios, { AxiosError } from 'axios';

interface InstanceClient {
	id?: EntityIds;
	operationsUrl?: string | null;
	port?: number;
	secure?: boolean;
}

export function getInstanceClient(
	{
		id = OverallAppSignIn,
		operationsUrl,
		port,
		secure,
		forceFabricConnect,
		disableFabricConnect,
		forceOperationToken,
		disableTokenRecovery,
	}: InstanceClient & {
		forceFabricConnect?: boolean;
		disableFabricConnect?: boolean;
		forceOperationToken?: boolean;
		/**
		 * Opt this client out of the direct-connect token lifecycle entirely — no request-time Bearer,
		 * no 401 recovery. Set by the refresh call itself: it carries the refresh token as its own
		 * Bearer, and a recovery interceptor on it would re-enter the mint that is awaiting it.
		 */
		disableTokenRecovery?: boolean;
	} = {},
) {
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

	// In Fabric Connect mode we obtain a JWT via the proxy (see authStore.establishFabricConnectAuth)
	// and then talk to the instance directly with a Bearer token instead of routing every operation
	// through the proxy. Basic auth and explicit proxy requests (forceFabricConnect) take precedence —
	// except when forceOperationToken is set (the establish probe, which must verify the JWT it just
	// minted even if a stale basic-auth entry exists for this id).
	const operationToken = forceFabricConnect || disableFabricConnect || (basicAuth && !forceOperationToken)
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

	const client = axios.create({
		auth: fabricConnect || operationToken ? undefined : basicAuth,
		withCredentials: fabricConnect || (!basicAuth && !operationToken),
		timeout: 60000,
		headers: {
			'Content-Type': 'application/json',
			...(operationToken ? { Authorization: `Bearer ${operationToken}` } : {}),
		},
		baseURL,
	});
	// The Bearer comes from the store on every send, not from the header baked in at construction: a
	// client outlives its token, so one refresh has to advance every client the page holds. A retry is
	// not a new send — `curryRetryGatewayErrors` sleeps up to 20s, long enough to reconnect as someone
	// else — so a request keeps the generation of its first send.
	if (operationToken && !disableTokenRecovery) {
		client.interceptors.request.use((config) => {
			const stamped = config as typeof config & { __connectionGeneration?: number };
			const generation = authStore.getConnectionGeneration(id);
			if (stamped.__connectionGeneration === undefined) {
				stamped.__connectionGeneration = generation;
			} else if (stamped.__connectionGeneration !== generation) {
				throw new AxiosError(
					'Connection replaced before this request could be retried.',
					AxiosError.ERR_CANCELED,
					config,
				);
			}
			const token = authStore.getOperationToken(id);
			if (token) {
				config.headers.Authorization = `Bearer ${token}`;
			} else {
				// Signed out: drop the constructor-baked header rather than letting a JWT the store has
				// discarded — still valid at the instance for ~a day — ride out on a retained client.
				delete config.headers.Authorization;
			}
			return config;
		});
	}
	// After the Bearer interceptor, so it runs first: a request held through a restart picks up its
	// token (and connection generation) when it is finally sent.
	installRestartGate(client, id, {
		proxied: fabricConnect,
		connectionGeneration: () => authStore.getConnectionGeneration(id),
	});
	client.interceptors.response.use(
		rejectReplicationFailures,
		curryRetryGatewayErrors(client),
	);
	// Direct-connect clients recover from a 401 (expired operation token) by minting a fresh token and
	// replaying once. Registered after the gateway-retry handler, which passes a 401 straight through.
	if (operationToken && !disableTokenRecovery) {
		client.interceptors.response.use(undefined, curryRecoverExpiredOperationToken(client, id));
	}
	return client;
}

/** Mirrors the resolution above for a `getInstanceClient({ id })` with no overrides; keep in step. */
export function connectsThroughProxy(id: EntityIds): boolean {
	const operationToken = authStore.checkForBasicAuth(id) ? undefined : authStore.getOperationToken(id);
	return !operationToken && authStore.checkForFabricConnect(id);
}
