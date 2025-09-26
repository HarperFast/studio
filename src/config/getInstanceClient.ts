import { rejectReplicationFailures } from '@/lib/api/replication';
import { authStore, EntityIds, OverallAppSignIn } from '@/lib/authStore';
import axios from 'axios';

interface InstanceClient {
	id?: EntityIds;
	operationsUrl?: string | null;
}

export function getInstanceClient({ id = OverallAppSignIn, operationsUrl }: InstanceClient = {}) {
	const baseURL = operationsUrl || authStore.getOperationsUrl(id);
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
