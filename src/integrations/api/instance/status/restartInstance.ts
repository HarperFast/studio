import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { getInstanceUserInfo } from '@/integrations/api/instance/status/getInstanceUserInfo';
import { ReplicatedResponse } from '@/integrations/api/replication';
import { axiosRetry } from '@/lib/axiosRetry';
import { sleep } from '@/lib/sleep';
import { useMutation } from '@tanstack/react-query';

interface RestartInstanceParams {
	operation: 'restart_service' | 'restart';
	replicated: boolean;
}

export async function restartInstance({ operation, replicated, instanceClient }: RestartInstanceParams & InstanceClientConfig): Promise<ReplicatedResponse> {
	const { data } = await instanceClient.post('/', {
		operation,
		service: operation === 'restart_service' ? 'http' : undefined,
		replicated,
	});
	await sleep(10_000);
	await axiosRetry(() => getInstanceUserInfo({ instanceClient, timeout: 3_000 }), 12, 15_000);
	return data;
}

export function useRestartInstance() {
	return useMutation({
		mutationFn: restartInstance,
	});
}
