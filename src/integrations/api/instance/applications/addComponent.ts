import { InstanceClientConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { ReplicatedResponse } from '@/integrations/api/replication';
import { useMutation } from '@tanstack/react-query';

export interface CreateComponentFormData {
	project: string;
	template: string;
}

async function addComponent({
	instanceClient,
	project,
	template,
	entityType,
}: CreateComponentFormData & InstanceClientConfig & InstanceTypeConfig): Promise<ReplicatedResponse> {
	const { data } = await instanceClient.post('/', {
		operation: 'add_component',
		project,
		template,
		replicated: entityType === 'cluster',
	}, { timeout: 300_000 });
	return data;
}

export function useAddComponentMutation() {
	return useMutation({
		mutationFn: addComponent,
	});
}
