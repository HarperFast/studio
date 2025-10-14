import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { ReplicatedResponse } from '@/lib/api/replication';

interface SetConfigurationParams extends InstanceClientConfig {
	[key: string]: unknown;
}

export async function setConfiguration({
	instanceClient,
	...changes
}: SetConfigurationParams): Promise<ReplicatedResponse> {
	const { data } = await instanceClient.post('/', {
		operation: 'set_configuration',
		...changes,
	});
	return data;
}
