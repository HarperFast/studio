import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { ReplicatedResponse } from '@/lib/api/replication';
import { useMutation } from '@tanstack/react-query';

interface DropComponentRequest extends InstanceClientConfig {
	project: string;
	file: string | undefined;
	replicated: boolean;
}

async function dropComponent({
	file,
	project,
	replicated,
	instanceClient,
}: DropComponentRequest): Promise<ReplicatedResponse> {
	const { data } = await instanceClient.post('/', {
		operation: 'drop_component',
		file: file || undefined,
		project,
		replicated,
	});
	return data;
}

export function useDropComponent() {
	return useMutation({
		mutationFn: dropComponent,
	});
}
