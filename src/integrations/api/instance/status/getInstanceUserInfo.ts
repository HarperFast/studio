import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { LocalUser } from '@/integrations/api/api.patch';
import type { AxiosRequestConfig } from 'axios';

export async function getInstanceUserInfo({ instanceClient, ...config }: InstanceClientConfig & AxiosRequestConfig) {
	const { data } = await instanceClient.post('/', {
		operation: 'user_info',
	}, config);
	return data as LocalUser;
}
