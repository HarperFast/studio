import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';
import z from 'zod';

interface RolesPermissions {
	create: boolean;
	view: boolean;
	update: boolean;
	delete: boolean;
}

interface ClustersPermissions {
	create: boolean;
	view: boolean;
	update: boolean;
	delete: boolean;
	resources: string[];
}

export interface AddOrgRoleFormData {
	roleName: string;
	organizationId: string;
	updateOrganization: boolean;
	deleteOrganization?: boolean;
	roles: RolesPermissions;
	clusters: ClustersPermissions;
}

export const AddOrganizationRoleSchema = z.object({
	roleName: z
		.string({
			message: 'Please enter a role name.',
		})
		.min(1, { message: 'Role name must be at least 1 character.' })
		.regex(/^[a-zA-Z_]+$/, {
			message: 'Role must contain only letters and underscores.',
		})
		.max(30, { message: 'Role name must be less than 30 characters.' }),
	updateOrganization: z.boolean(),
	deleteOrganization: z.boolean(),
});

export async function onAddOrganizationRoleSubmit(formData: AddOrgRoleFormData) {
	const { data } = await apiClient.post('/Role' as '/Role/', formData);
	return data;
}

export function useAddOrganizationRole() {
	return useMutation({
		mutationFn: (formData: AddOrgRoleFormData) => onAddOrganizationRoleSubmit(formData),
	});
}
