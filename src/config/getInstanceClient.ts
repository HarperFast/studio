import { rejectReplicationFailures } from '@/lib/api/replication';
import { authStore, EntityIds, OverallAppSignIn } from '@/lib/authStore';
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
	const client = axios.create({
		withCredentials: true,
		timeout: 15000,
		headers: {
			'Content-Type': 'application/json',
		},
		baseURL,
	});
	client.interceptors.response.use(rejectReplicationFailures);
	return client;
}
