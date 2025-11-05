import { apiClient } from '@/config/apiClient';
import { UpdateUserSchema } from '@/features/profile/mutations/updateUserSchema';
import { SchemaUser } from '@/lib/api.gen';
import { User } from '@/lib/api.patch';
import { useMutation } from '@tanstack/react-query';
import z from 'zod';

async function onUpdateUser(formData: z.infer<typeof UpdateUserSchema>) {
	const { id, newPassword, confirmNewPassword, ...otherFields } = formData;
	const userData: Partial<SchemaUser & { password: string; }> = {
		...otherFields,
	};
	if (newPassword && newPassword === confirmNewPassword) {
		userData.password = newPassword;
	}
	const { data } = await apiClient.patch(`/User/${id}` as '/User/{id}', userData);
	return data as Partial<User>;
}

export function useUpdateUserMutation() {
	return useMutation({
		mutationFn: (formData: z.infer<typeof UpdateUserSchema>) => onUpdateUser(formData),
	});
}
