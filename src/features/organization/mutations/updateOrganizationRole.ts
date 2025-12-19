import { apiClient } from '@/config/apiClient';
import { SchemaRole } from '@/integrations/api/api.gen';
import { useMutation } from '@tanstack/react-query';
import { OrganizationRoleUpdatePayloadType } from './OrganizationRoleFormSchema';

interface UpdateOrganizationRoleParams {
	roleId: string;
	updatedRoleInfo: OrganizationRoleUpdatePayloadType;
}

export async function onUpdateOrganizationRole({
	roleId,
	updatedRoleInfo,
}: UpdateOrganizationRoleParams) {
	const { data } = await apiClient.put(`/Role/${roleId}` as '/Role/{id}', updatedRoleInfo);
	return data as SchemaRole;
}

export function useUpdateOrganizationRole() {
	return useMutation<
		SchemaRole,
		Error,
		UpdateOrganizationRoleParams
	>({
		mutationFn: ({ roleId, updatedRoleInfo }: UpdateOrganizationRoleParams) =>
			onUpdateOrganizationRole({ roleId, updatedRoleInfo }),
	});
}
