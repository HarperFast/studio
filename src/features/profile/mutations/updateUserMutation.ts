import { apiClient } from '@/config/apiClient';
import { UpdateUserSchema } from '@/features/profile/mutations/updateUserSchema';
import { useMutation } from '@tanstack/react-query';
import z from 'zod';

async function onUpdateUser(formData: z.infer<typeof UpdateUserSchema>) {
	const { data } = await apiClient.patch(`/User/${formData.id}` as '/User/{id}', formData);
	return data;
}

export function useUpdateUserMutation() {
	return useMutation({
		mutationFn: (formData: z.infer<typeof UpdateUserSchema>) => onUpdateUser(formData),
	});
}
