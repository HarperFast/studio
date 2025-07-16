import { useMutation } from '@tanstack/react-query';
import { instanceClient } from '@/config/instanceClient';

export interface AlterRoleRequestBody {
	id: string;
	permissions: string;
	operationsUrl?: string;
}

interface AlterRoleResponse {
	id: string;
	permissions: object;
	role: string;
	__createdtime__: number;
	__updatedtime__: number;
}

export async function onAlterRole({
	id,
	permissions,
	operationsUrl,
}: AlterRoleRequestBody): Promise<AlterRoleResponse> {
	const { data } = await instanceClient.post(
		'/',
		{
			operation: 'alter_role',
			id,
			permissions,
		},
		{ baseURL: operationsUrl }
	);
	return data as AlterRoleResponse;
}

export function useAlterRole() {
	return useMutation({
		mutationFn: (recordsData: AlterRoleRequestBody) => onAlterRole(recordsData),
	});
}
