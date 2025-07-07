import { User } from '@/lib/api.patch';
import { apiClient } from '@/config/apiClient';

export async function getCloudUser(): Promise<User> {
	const { data } = await apiClient.get('/User/current' as '/User/{id}');
	return data as User;
}
