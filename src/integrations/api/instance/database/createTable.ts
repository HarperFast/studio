import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { ReplicatedResponse } from '@/integrations/api/replication';
import { useMutation } from '@tanstack/react-query';

interface CreateTableFormData extends InstanceClientConfig {
	databaseName: string;
	tableName: string;
	primaryKey: string;
	replicated: boolean;
}

async function onCreateTableSubmit({
	databaseName,
	tableName,
	primaryKey,
	replicated,
	instanceClient,
}: CreateTableFormData): Promise<ReplicatedResponse> {
	const { data } = await instanceClient.post('/', {
		operation: 'create_table',
		database: databaseName,
		table: tableName,
		primary_key: primaryKey,
		replicated,
	});
	return data;
}

export function useCreateTableMutation() {
	return useMutation({
		mutationFn: onCreateTableSubmit,
	});
}
