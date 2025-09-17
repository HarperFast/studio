import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';

export interface CreateComponentFormData {
	applicationName: string;
	replicated: boolean;
}

async function onCreateComponentSubmit({
	applicationName,
	instanceClient,
	replicated,
}: CreateComponentFormData & InstanceClientConfig) {
	const { data } = await instanceClient.post('/', {
		operation: 'add_component',
		project: applicationName,
		replicated,
	});
	return data;
}

export function useCreateComponentMutation() {
	return useMutation({
		mutationFn: onCreateComponentSubmit,
	});
}
