import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';

export interface AddOrgRoleFormData {
	roleName: string;
	organizationId: string;
	updateOrganization: boolean;
	deleteOrganization?: boolean; // In API yet?
	permissions: object; // Adjust type as needed
}

export async function onAddOrganizationRoleSubmit(formData: AddOrgRoleFormData) {
	const { data } = await apiClient.post('/Role' as '/Role/', {
		name: formData.roleName,
		organizationId: formData.organizationId,
		update: formData.updateOrganization,
		// delete: formData.deleteOrganization, // In API yet?
		...formData.permissions,
	});
	return data;
}

export function useAddOrganizationRole() {
	return useMutation({
		mutationFn: onAddOrganizationRoleSubmit,
	});
}
