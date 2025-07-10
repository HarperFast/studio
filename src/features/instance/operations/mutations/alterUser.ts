import { useMutation } from '@tanstack/react-query';
import { instanceClient } from '@/config/instanceClient';

interface AlterUserRequestBody {
	username?: string;
	password?: string;
	role?: string;
	active?: boolean;
	operationsUrl?: string;
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
	operationsUrl,
}: AlterUserRequestBody): Promise<AlterUserResponse> {
	const { data } = await instanceClient.post('/', {
		operation: 'alter_user',
		username,
		password,
		role,
		active,
	}, { baseURL: operationsUrl });
	return data as AlterUserResponse;
}

export function useAlterUser() {
	return useMutation({
		mutationFn: (recordsData: AlterUserRequestBody) => onAlterUser(recordsData),
	});
}
