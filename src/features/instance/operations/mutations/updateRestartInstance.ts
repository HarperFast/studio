import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { getInstanceUserInfo } from '@/features/instance/operations/queries/getInstanceUserInfo';
import { axiosRetry } from '@/lib/axiosRetry';
import { sleep } from '@/lib/sleep';
import { useMutation } from '@tanstack/react-query';

interface UpdateRestartInstanceResponse {
	message: string;
}

async function onUpdateRestartInstance({ instanceClient }: InstanceClientConfig) {
	const { data } = await instanceClient.post('/', {
		operation: 'restart',
		restart: 'rolling',
	});
	await sleep(3_000);
	await axiosRetry(() => getInstanceUserInfo({ instanceClient, timeout: 10_000 }), 5, 3_000);
	return data as UpdateRestartInstanceResponse;
}

export function useUpdateRestartInstance() {
	return useMutation({
		mutationFn: onUpdateRestartInstance,
	});
}
