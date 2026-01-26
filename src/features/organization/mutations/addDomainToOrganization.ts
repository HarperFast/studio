import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';
import z from 'zod';

export const AddOrganizationDomainSchema = z.object({
	domain: z.string(),
	organizationId: z.string(),
});

export async function onAddDomainToOrganizationSubmit(formData: z.infer<typeof AddOrganizationDomainSchema>) {
	// TODO: API does not describe this endpoint.
	const { data } = await apiClient.post('/Domain/' as any, formData);
	return data;
}

export function useAddDomainToOrganization() {
	return useMutation({
		mutationFn: (formData: z.infer<typeof AddOrganizationDomainSchema>) => onAddDomainToOrganizationSubmit(formData),
	});
}
