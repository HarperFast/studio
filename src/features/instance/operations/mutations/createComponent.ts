import { useMutation } from '@tanstack/react-query';
import instanceClient from '@/config/instanceClient';

type CreateComponentFormData = {
	newProjectName: string;
};

const onCreateComponentSubmit = async (formData: CreateComponentFormData) => {
	const { newProjectName } = formData;
	const { data } = await instanceClient.post('/', {
		operation: 'add_component',
		project: newProjectName,
	});
	return data;
};

const useCreateComponentMutation = () => {
	return useMutation({
		mutationFn: (formData: CreateComponentFormData) => onCreateComponentSubmit(formData),
	});
};

export { useCreateComponentMutation };
