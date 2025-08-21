import { authStore, EntityIds, OverallAppSignIn } from '@/lib/authStore';
import axios from 'axios';

export function getInstanceClient(id: EntityIds = OverallAppSignIn, operationsUrl?: string | null) {
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
