import { useMutation } from '@tanstack/react-query';
import { instanceClient } from '@/config/instanceClient';

type CreateDatabaseFormData = {
	databaseName: string;
};

const onCreateDatabaseSubmit = async (formData: CreateDatabaseFormData) => {
	const { databaseName } = formData;
	const { data } = await instanceClient.post('/', {
		operation: 'create_database',
		database: databaseName,
		replicated: true,
	});
	return data;
};

const useCreateDatabaseSubmitMutation = () => {
	return useMutation({
		mutationFn: (formData: CreateDatabaseFormData) => onCreateDatabaseSubmit(formData),
	});
};

export { useCreateDatabaseSubmitMutation };
