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

export function getInstanceClient({ id = OverallAppSignIn, operationsUrl, port, secure, forceFabricConnect }: InstanceClient & { forceFabricConnect?: boolean} = {}) {
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

	const fabricConnect = forceFabricConnect || authStore.checkForFabricConnect(id);
	if (fabricConnect) {
		if (id.startsWith('clu-')) {
			baseURL = apiClient.defaults.baseURL + `/Cluster/${id}/operation`;
		} else if (id.startsWith('ins-')) {
			baseURL = apiClient.defaults.baseURL + `/HDBInstance/${id}/operation`;
		}
	}

	const basicAuth = authStore.checkForBasicAuth(id);

	const client = axios.create({
		auth: fabricConnect ? undefined : basicAuth,
		withCredentials: fabricConnect || !basicAuth,
		timeout: 15000,
		headers: {
			'Content-Type': 'application/json',
		},
		baseURL,
	});
	client.interceptors.response.use(
		rejectReplicationFailures,
		curryRetryGatewayErrors(client),
	);
	return client;
}
