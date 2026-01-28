import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { queryOptions } from '@tanstack/react-query';

export interface CertificateDetails {
	issuer: string;
	subject: string;
	serial_number: string;
	valid_from: string;
	valid_to: string;
	subject_alt_name?: string;
}

export interface Certificate {
	name: string;
	certificate: string;
	private_key_name?: string;
	is_authority: boolean;
	is_self_signed: boolean;
	uses: string[];
	details: CertificateDetails;
	hosts?: string[];
}

async function listCertificates({ instanceClient }: InstanceClientIdConfig) {
	const { data } = await instanceClient.post<Certificate[]>('/', {
		operation: 'list_certificates',
	});
	return data;
}

export function listCertificatesQueryOptions(params: InstanceClientIdConfig) {
	return queryOptions({
		queryKey: [params.entityId, 'list_certificates'] as const,
		queryFn: () => listCertificates(params),
	});
}
