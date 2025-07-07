import { instanceClient } from '@/config/instanceClient';
import { queryOptions } from '@tanstack/react-query';
import { LocalUser } from '@/lib/api.patch';

export function getUserInfoQueryOptions(baseURL?: string) {
	return queryOptions({
		queryKey: ['user_info', baseURL] as const,
		queryFn: getUserInfo,
	});
}

export async function getUserInfo(context?: { queryKey: ['user_info', string | undefined] }) {
	const { data } = await instanceClient.post('/', {
		operation: 'user_info',
	}, { baseURL: context?.queryKey[1] });
	return data as LocalUser;
}
