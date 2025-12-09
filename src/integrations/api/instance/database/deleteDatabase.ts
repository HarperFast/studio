import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { ReplicatedResponse } from '@/integrations/api/replication';
import { useMutation } from '@tanstack/react-query';

interface DeleteDatabaseParams extends InstanceClientConfig {
	databaseName: string;
	replicated: boolean;
}

async function onDeleteDatabase(
	{ databaseName, replicated, instanceClient }: DeleteDatabaseParams,
): Promise<ReplicatedResponse> {
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
