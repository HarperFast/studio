import { instanceClient } from '@/config/instanceClient';
import { queryOptions } from '@tanstack/react-query';
import { LocalUser } from '@/lib/api.patch';

export function getUserInfoQueryOptions() {
	return queryOptions({
		queryKey: ['user_info'] as const,
		queryFn: getUserInfo,
	});
}

export async function getUserInfo() {
	const { data } = await instanceClient.post('/', {
		operation: 'user_info',
	});
	return data as LocalUser;
}
