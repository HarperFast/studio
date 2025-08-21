import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { getInstanceUserInfo } from '@/features/instance/operations/queries/getInstanceUserInfo';
import { axiosRetry } from '@/lib/axiosRetry';
import { sleep } from '@/lib/sleep';
import { useMutation } from '@tanstack/react-query';

interface RestartInstanceParams {
	operation: 'restart_service' | 'restart';
}

interface UpdateRestartInstanceResponse {
	message: string;
}

async function onRestartInstance({ operation, instanceClient }: RestartInstanceParams & InstanceClientConfig) {
	const { data } = await instanceClient.post('/', {
		operation,
	});
	await sleep(3_000);
	await axiosRetry(() => getInstanceUserInfo({ instanceClient, timeout: 10_000 }), 5, 3_000);
	return data as UpdateRestartInstanceResponse;
}

export function useRestartInstance() {
	return useMutation({
		mutationFn: onRestartInstance,
	});
}
