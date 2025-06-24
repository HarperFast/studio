import { useMutation } from '@tanstack/react-query';
import { instanceClient } from '@/config/instanceClient';
import { sleep } from '@/lib/sleep';
import { axiosRetry } from '@/lib/axios-retry.ts';

type UpdateRestartInstanceResponse = {
	message: string;
};

const onUpdateRestartInstance = async () => {
	const { data } = await instanceClient.post('/', {
		operation: 'restart',
	});
	await sleep(3000);
	await axiosRetry(() => instanceClient.post('/', { operation: 'user_info' }, { timeout: 10000 }), 5, 3000);
	return data as UpdateRestartInstanceResponse;
};

const useUpdateRestartInstance = () => {
	return useMutation({
		mutationFn: () => onUpdateRestartInstance(),
	});
};

export { useUpdateRestartInstance };
