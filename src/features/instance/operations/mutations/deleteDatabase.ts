import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';

interface DeleteDatabaseParams extends InstanceClientConfig {
	databaseName: string;
	replicated: boolean;
}

async function onDeleteDatabase({ databaseName, replicated, instanceClient }: DeleteDatabaseParams) {
	const { data } = await instanceClient.post('/', {
		operation: 'drop_database',
		database: databaseName,
		replicated,
	});
	return data;
}

export function useDeleteDatabaseMutation() {
	return useMutation({
		mutationFn: onDeleteDatabase,
	});
}
