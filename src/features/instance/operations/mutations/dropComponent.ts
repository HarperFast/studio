import { InstanceClientConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { ReplicatedResponse } from '@/lib/api/replication';
import { useMutation } from '@tanstack/react-query';

interface DropComponentRequest extends InstanceClientConfig, InstanceTypeConfig {
	project: string;
	file: string | undefined;
}

export async function dropComponent({
	file,
	project,
	entityType,
	instanceClient,
}: DropComponentRequest): Promise<ReplicatedResponse> {
	const { data } = await instanceClient.post('/', {
		operation: 'drop_component',
		file: file || undefined,
		project,
		replicated: entityType === 'cluster',
	});
	return data;
}

export function useDropComponent() {
	return useMutation({
		mutationFn: dropComponent,
	});
}
