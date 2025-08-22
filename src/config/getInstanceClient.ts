import { authStore, EntityIds, OverallAppSignIn } from '@/lib/authStore';
import axios from 'axios';

interface InstanceClient {
	id?: EntityIds;
	operationsUrl?: string | null;
}

export function getInstanceClient({ id = OverallAppSignIn, operationsUrl }: InstanceClient = {}) {
	const baseURL = operationsUrl || authStore.getOperationsUrl(id);
	return axios.create({
		withCredentials: true,
		timeout: 15000,
		headers: {
			'Content-Type': 'application/json',
		},
		baseURL,
	});
}
