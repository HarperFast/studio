import { authStore, EntityIds, OverallAppSignIn } from '@/features/auth/store/authStore';
import { rejectReplicationFailures } from '@/lib/api/replication';
import axios from 'axios';

interface InstanceClient {
	id?: EntityIds;
	operationsUrl?: string | null;
	port?: number;
	secure?: boolean;
}

export function getInstanceClient({ id = OverallAppSignIn, operationsUrl, port, secure }: InstanceClient = {}) {
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
	const auth = authStore.checkForBasicAuth(id);
	const client = axios.create({
		auth,
		withCredentials: !auth,
		timeout: 15000,
		headers: {
			'Content-Type': 'application/json',
		},
		baseURL,
	});
	client.interceptors.response.use(rejectReplicationFailures);
	return client;
}
