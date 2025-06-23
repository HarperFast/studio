import { useMutation } from '@tanstack/react-query';
import { instanceClient } from '@/config/instanceClient';

type UpdateRestartInstanceResponse = {
	message: string;
};

const onUpdateRestartInstance = async () => {
	const { data } = await instanceClient.post('/', {
		operation: 'restart',
	});
	return data as UpdateRestartInstanceResponse;
};

const useUpdateRestartInstance = () => {
	return useMutation({
		mutationFn: () => onUpdateRestartInstance(),
	});
};

export { useUpdateRestartInstance };
