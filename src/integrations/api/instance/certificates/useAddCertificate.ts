import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { addCertificate, AddCertificateParams } from './addCertificate';

export const CertificateSchema = z.object({
	name: z.string().min(1, 'Name is required'),
	certificate: z.string().min(1, 'Certificate is required'),
	private_key: z.string().optional(),
	is_authority: z.boolean().default(false),
	hosts: z.string().optional(),
	uses: z.string().optional(),
});

export function useAddCertificate() {
	return useMutation({
		mutationFn: ({
			instanceParams,
			certificateParams,
		}: {
			instanceParams: InstanceClientIdConfig;
			certificateParams: AddCertificateParams;
		}) => addCertificate(instanceParams, certificateParams),
	});
}
