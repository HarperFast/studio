import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { getInstanceUserInfo } from '@/features/instance/operations/queries/getInstanceUserInfo';
import { axiosRetry } from '@/lib/axiosRetry';
import { sleep } from '@/lib/sleep';
import { useMutation } from '@tanstack/react-query';

interface RestartInstanceParams {
	operation: 'restart_service' | 'restart';
	replicated: boolean;
}

interface UpdateRestartInstanceResponse {
	message: string;
}

export async function restartInstance({ operation, replicated, instanceClient }: RestartInstanceParams & InstanceClientConfig) {
	const { data } = await instanceClient.post('/', {
		operation,
		service: operation === 'restart_service' ? 'http' : undefined,
		replicated,
	});
	await sleep(10_000);
	await axiosRetry(() => getInstanceUserInfo({ instanceClient, timeout: 3_000 }), 12, 15_000);
	return data as UpdateRestartInstanceResponse;
}

export function useRestartInstance() {
	return useMutation({
		mutationFn: restartInstance,
	});
}
