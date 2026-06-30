import { apiClient } from '@/config/apiClient';
import { authStore, EntityIds, OverallAppSignIn } from '@/features/auth/store/authStore';
import { rejectReplicationFailures } from '@/integrations/api/replication';
import { curryRetryGatewayErrors } from '@/integrations/api/retryGatewayErrors';
import axios from 'axios';

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
	}: InstanceClient & {
		forceFabricConnect?: boolean;
		disableFabricConnect?: boolean;
		forceOperationToken?: boolean;
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
	client.interceptors.response.use(
		rejectReplicationFailures,
		curryRetryGatewayErrors(client),
	);
	return client;
}
