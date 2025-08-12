import { useMutation } from '@tanstack/react-query';
import { instanceClient } from '@/config/instanceClient';

const onDeleteDatabase = async (databaseName: string) => {
	const { data } = await instanceClient.post('/', {
		operation: 'drop_database',
		database: databaseName,
		replicated: true,
	});
	return data;
};

const useDeleteDatabaseMutation = () => {
	return useMutation({
		mutationFn: (databaseName: string) => onDeleteDatabase(databaseName),
	});
};

export { useDeleteDatabaseMutation };
