import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';
import { removeCertificate } from './removeCertificate';

export function useRemoveCertificate() {
	return useMutation({
		mutationFn: ({ instanceParams, name }: { instanceParams: InstanceClientIdConfig; name: string }) =>
			removeCertificate(instanceParams, name),
	});
}
