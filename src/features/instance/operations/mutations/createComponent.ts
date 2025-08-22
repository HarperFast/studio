import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';

export interface CreateComponentFormData {
	newApplicationName: string;
	replicated: boolean;
}

async function onCreateComponentSubmit({
	newApplicationName,
	instanceClient,
	replicated,
}: CreateComponentFormData & InstanceClientConfig) {
	const { data } = await instanceClient.post('/', {
		operation: 'add_component',
		project: newApplicationName,
		replicated,
	});
	return data;
}

export function useCreateComponentMutation() {
	return useMutation({
		mutationFn: onCreateComponentSubmit,
	});
}
