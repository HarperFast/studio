import { useMutation } from '@tanstack/react-query';
import { instanceClient } from '@/config/instanceClient';

type CreateDatabaseFormData = {
	newDatabaseName: string;
};

const onCreateDatabaseSubmit = async (formData: CreateDatabaseFormData) => {
	const { newDatabaseName } = formData;
	const { data } = await instanceClient.post('/', {
		operation: 'create_database',
		database: newDatabaseName,
	});
	return data;
};

const useCreateDatabaseSubmitMutation = () => {
	return useMutation({
		mutationFn: (formData: CreateDatabaseFormData) => onCreateDatabaseSubmit(formData),
	});
};

export { useCreateDatabaseSubmitMutation };
