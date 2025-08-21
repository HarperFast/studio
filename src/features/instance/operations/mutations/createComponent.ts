import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';

export interface CreateComponentFormData {
	newApplicationName: string;
}

async function onCreateComponentSubmit({ newApplicationName, instanceClient }: CreateComponentFormData & InstanceClientConfig) {
	const { data } = await instanceClient.post('/', {
		operation: 'add_component',
		project: newApplicationName,
		replicated: true,
	});
	return data;
}

export function useCreateComponentMutation() {
	return useMutation({
		mutationFn: onCreateComponentSubmit,
	});
}
