import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { SystemStatus } from '@/integrations/api/instance/status/getStatus';
import { ReplicatedResponse } from '@/integrations/api/replication';
import { queryClient } from '@/react-query/queryClient';
import { useMutation } from '@tanstack/react-query';

interface SetConfigurationParams extends Pick<SystemStatus, 'id' | 'status'>, InstanceClientIdConfig {
}

async function setStatus({
	instanceClient,
	id,
	status,
}: SetConfigurationParams): Promise<ReplicatedResponse> {
	const { data } = await instanceClient.post('/', {
		operation: 'set_status',
		id,
		status,
	});
	return data;
}

export function useSetStatus() {
	return useMutation({
		mutationFn: setStatus,
		onSuccess: (_data, variables) => queryClient.invalidateQueries({ queryKey: [variables.entityId, 'get_status'] }),
	});
}
