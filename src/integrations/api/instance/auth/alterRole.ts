import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { LocalRolePermission } from '@/integrations/api/api.patch';
import { useMutation } from '@tanstack/react-query';

interface AlterRoleRequestBody extends InstanceClientConfig {
	id: string;
	permission: LocalRolePermission;
}

interface AlterRoleResponse {
	id: string;
	permission: object;
	role: string;
	__createdtime__: number;
	__updatedtime__: number;
}

async function onAlterRole({
	id,
	permission,
	instanceClient,
}: AlterRoleRequestBody): Promise<AlterRoleResponse> {
	const { data } = await instanceClient.post(
		'/',
		{
			operation: 'alter_role',
			id,
			permission,
		},
	);
	return data as AlterRoleResponse;
}

export function useAlterRole() {
	return useMutation({
		mutationFn: onAlterRole,
	});
}
