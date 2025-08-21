import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';

interface CreateTableFormData extends InstanceClientConfig {
	databaseName: string;
	tableName: string;
	primaryKey: string;
}

async function onCreateTableSubmit({ databaseName, tableName, primaryKey, instanceClient }: CreateTableFormData) {
	const { data } = await instanceClient.post('/', {
		operation: 'create_table',
		database: databaseName,
		table: tableName,
		primary_key: primaryKey,
		replicated: true,
	});
	return data;
}

export function useCreateTableMutation() {
	return useMutation({
		mutationFn: onCreateTableSubmit,
	});
}
