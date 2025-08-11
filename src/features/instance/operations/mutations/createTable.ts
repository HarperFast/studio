import { useMutation } from '@tanstack/react-query';
import { instanceClient } from '@/config/instanceClient';

type CreateDatabaseFormData = {
	databaseName: string;
	tableName: string;
	primaryKey: string;
};

const onCreateTableSubmit = async (formData: CreateDatabaseFormData) => {
	const { databaseName, tableName, primaryKey } = formData;
	const { data } = await instanceClient.post('/', {
		operation: 'create_table',
		database: databaseName,
		table: tableName,
		primary_key: primaryKey,
		replicated: true,
	});
	return data;
};

const useCreateTableMutation = () => {
	return useMutation({
		mutationFn: (formData: CreateDatabaseFormData) => onCreateTableSubmit(formData),
	});
};

export { useCreateTableMutation };
export type { CreateDatabaseFormData };
