import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { ReplicatedResponse } from '@/lib/api/replication';
import { useMutation } from '@tanstack/react-query';

export interface CreateComponentFormData {
	applicationName: string;
	replicated: boolean;
}

async function onCreateComponentSubmit({
	applicationName,
	instanceClient,
	replicated,
}: CreateComponentFormData & InstanceClientConfig): Promise<ReplicatedResponse> {
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
