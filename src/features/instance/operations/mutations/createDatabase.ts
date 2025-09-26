import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { ReplicatedResponse } from '@/lib/api/replication';
import { useMutation } from '@tanstack/react-query';

interface CreateDatabaseFormData extends InstanceClientConfig {
	databaseName: string;
	replicated: boolean;
}

async function onCreateDatabaseSubmit({
	databaseName,
	replicated,
	instanceClient,
}: CreateDatabaseFormData): Promise<ReplicatedResponse> {
	const { data } = await instanceClient.post('/', {
		operation: 'create_database',
		database: databaseName,
		replicated,
	});
	return data;
}

export function useCreateDatabaseSubmitMutation() {
	return useMutation({
		mutationFn: onCreateDatabaseSubmit,
	});
}
