import { InstanceClientIdConfig } from '@/config/instanceClientConfig';

export async function removeCertificate({ instanceClient }: InstanceClientIdConfig, name: string) {
	const { data } = await instanceClient.post<{ message: string }>('/', {
		operation: 'remove_certificate',
		name,
	});
	return data;
}
