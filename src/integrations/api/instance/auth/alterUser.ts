import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';

export interface AlterUserRequestBody extends InstanceClientConfig {
	username?: string;
	password?: string;
	role?: string;
	active?: boolean;
}

interface AlterUserResponse {
	message: string;
	skipped_hashes: string[];
	txn_time: number;
	update_hashes: string[];
}

export async function onAlterUser({
	username,
	password,
	role,
	active,
	instanceClient,
}: AlterUserRequestBody): Promise<AlterUserResponse> {
	const { data } = await instanceClient.post('/', {
		operation: 'alter_user',
		username,
		password,
		role,
		active,
	});
	return data as AlterUserResponse;
}

export function useAlterUser() {
	return useMutation({
		mutationFn: onAlterUser,
	});
}
