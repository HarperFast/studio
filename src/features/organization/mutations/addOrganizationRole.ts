import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';
import { OrganizationRoleUpdatePayloadType } from './OrganizationRoleFormSchema';

export async function onAddOrganizationRoleSubmit(formData: OrganizationRoleUpdatePayloadType) {
	const { data } = await apiClient.post('/Role/', formData);
	return data;
}

export function useAddOrganizationRole() {
	return useMutation({
		mutationFn: onAddOrganizationRoleSubmit,
	});
}
