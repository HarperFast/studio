import { User } from '@/lib/api.patch';
import { apiClient } from '@/config/apiClient';
import { queryKeys } from '@/react-query/constants';
import { queryOptions } from '@tanstack/react-query';

export async function getCurrentUser(): Promise<User> {
	const { data } = await apiClient.get('/User/current' as '/User/{id}');
	return data as User;
}
