import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';

export interface AlterUserRequestBody extends InstanceClientConfig {
	username?: string;
	password?: string;
	role?: string;
	active?: boolean;
}

export const AlterUserFormSchema = z.object({
	username: z.string({
		error: 'Please enter a username.',
	}).min(1, { error: 'Please enter a username.' }),
	role: z.string({
		error: 'Please select a role.',
	}),
	newPassword: z
		.string({
			error: 'Please enter a password.',
		})
		// TODO: Verify restrictions
		.max(50, { error: 'Password must be less than 50 characters.' })
		.optional(),
	confirmPassword: z
		.string({
			error: 'Please enter the password again.',
		})
		.optional(),
})
	.refine((data) => !data.newPassword || data.newPassword.length >= 8, {
		error: 'Password must be 8 characters or more.',
		path: ['password'], // This specifies where the error message should be attached
	})
	.refine((data) => !data.newPassword || data.newPassword === data.confirmPassword, {
		error: 'Passwords do not match',
		path: ['confirmPassword'], // This specifies where the error message should be attached
	});

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
