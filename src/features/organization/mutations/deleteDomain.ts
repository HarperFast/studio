import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';
import z from 'zod';

export const DeleteDomainSchema = z.object({
	domainId: z.string(),
});

async function deleteDomainSubmit(formData: z.infer<typeof DeleteDomainSchema>) {
	// TODO: API does not describe this endpoint.
	const { data } = await apiClient.delete(`/Domain/${formData.domainId}` as any);
	return data;
}

export function useDeleteDomain() {
	return useMutation({
		mutationFn: (formData: z.infer<typeof DeleteDomainSchema>) => deleteDomainSubmit(formData),
	});
}
