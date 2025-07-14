import { useMutation } from '@tanstack/react-query';
import { instanceClient } from '@/config/instanceClient';
import { sleep } from '@/lib/sleep';
import { axiosRetry } from '@/lib/axiosRetry';
import { getUserInfo } from '@/features/instance/operations/queries/getUserInfo';

type UpdateRestartInstanceResponse = {
	message: string;
};

async function onUpdateRestartInstance() {
	const operationsUrl = instanceClient.defaults.baseURL;
	const { data } = await instanceClient.post('/', {
		operation: 'restart',
	});
	await sleep(3000);
	await axiosRetry(() => getUserInfo({ timeout: 10000, operationsUrl }), 5, 3000);
	return data as UpdateRestartInstanceResponse;
}

export function useUpdateRestartInstance() {
	return useMutation({
		mutationFn: () => onUpdateRestartInstance(),
	});
}
