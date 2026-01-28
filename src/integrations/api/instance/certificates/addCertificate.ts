import { InstanceClientIdConfig } from '@/config/instanceClientConfig';

export interface AddCertificateParams {
	name: string;
	certificate: string;
	private_key?: string;
	is_authority: boolean;
	hosts?: string[];
	uses?: string[];
}

export async function addCertificate({ instanceClient }: InstanceClientIdConfig, params: AddCertificateParams) {
	const { data } = await instanceClient.post<{ message: string }>('/', {
		operation: 'add_certificate',
		...params,
	});
	return data;
}
