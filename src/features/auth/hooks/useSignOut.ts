import { apiClient } from '@/config/apiClient';
import { useMutation } from '@tanstack/react-query';
import { signOutOnSuccess } from '@/features/auth/hooks/signOutOnSuccess';

export async function onSignOutSubmit() {
	await apiClient.post('/Logout/');
}

export function useSignOutMutation() {
	return useMutation({
		mutationFn: () => onSignOutSubmit(),
		onSuccess: signOutOnSuccess,
	});
}
