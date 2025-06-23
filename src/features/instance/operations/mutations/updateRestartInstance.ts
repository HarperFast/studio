import { useMutation } from '@tanstack/react-query';
import { instanceClient } from '@/config/instanceClient';
import { sleep } from '@/lib/sleep';

type UpdateRestartInstanceResponse = {
	message: string;
};

const onUpdateRestartInstance = async () => {
	const { data } = await instanceClient.post('/', {
		operation: 'restart',
	});
	await sleep(1000);
	await instanceClient.post('/', {
		operation: 'user_info',
	});
	return data as UpdateRestartInstanceResponse;
};

const useUpdateRestartInstance = () => {
	return useMutation({
		mutationFn: () => onUpdateRestartInstance(),
	});
};

export { useUpdateRestartInstance };
