import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';

interface DeleteDatabaseParams extends InstanceClientConfig {
	databaseName: string;
}

async function onDeleteDatabase({ databaseName, instanceClient }: DeleteDatabaseParams) {
	const { data } = await instanceClient.post('/', {
		operation: 'drop_database',
		database: databaseName,
		replicated: true,
	});
	return data;
}

export function useDeleteDatabaseMutation() {
	return useMutation({
		mutationFn: onDeleteDatabase,
	});
}
