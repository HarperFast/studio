import { instanceClient } from '@/config/instanceClient';
import { LocalUser } from '@/lib/api.patch';

export async function getUserInfo(params?: { operationsUrl: string }) {
	const { data } = await instanceClient.post('/', {
		operation: 'user_info',
	}, { baseURL: params?.operationsUrl });
	return data as LocalUser;
}
