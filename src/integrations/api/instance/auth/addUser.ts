import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';

interface AddUserFormData extends InstanceClientConfig {
	active: boolean;
	password: string;
	role: string;
	username: string;
}

export async function onAddUserSubmit(formData: AddUserFormData) {
	const { instanceClient, ...userData } = formData;
	const { data } = await instanceClient.post('/', {
		operation: 'add_user',
		...userData,
	});
	return data;
}

export function useAddUserMutation() {
	return useMutation({
		mutationFn: onAddUserSubmit,
	});
}
