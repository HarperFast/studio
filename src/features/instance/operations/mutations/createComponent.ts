import { useMutation } from '@tanstack/react-query';
import { instanceClient } from '@/config/instanceClient';

type CreateComponentFormData = {
	newApplicationName: string;
};

const onCreateComponentSubmit = async (formData: CreateComponentFormData) => {
	const { newApplicationName } = formData;
	const { data } = await instanceClient.post('/', {
		operation: 'add_component',
		project: newApplicationName,
	});
	return data;
};

const useCreateComponentMutation = () => {
	return useMutation({
		mutationFn: (formData: CreateComponentFormData) => onCreateComponentSubmit(formData),
	});
};

export { useCreateComponentMutation };
export type { CreateComponentFormData };
