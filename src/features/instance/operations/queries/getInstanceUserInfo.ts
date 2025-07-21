import { instanceClient } from '@/config/instanceClient';
import { LocalUser } from '@/lib/api.patch';
import type { AxiosRequestConfig } from 'axios';

export async function getInstanceUserInfo(params?: { operationsUrl?: string } & AxiosRequestConfig) {
	const { operationsUrl, ...config } = params ?? {};
	const { data } = await instanceClient.post('/', {
		...config,
		operation: 'user_info',
	}, { baseURL: operationsUrl });
	return data as LocalUser;
}
