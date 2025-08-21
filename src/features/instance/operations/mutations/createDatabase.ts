import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';

interface CreateDatabaseFormData extends InstanceClientConfig {
	databaseName: string;
}

async function onCreateDatabaseSubmit({ databaseName, instanceClient }: CreateDatabaseFormData) {
	const { data } = await instanceClient.post('/', {
		operation: 'create_database',
		database: databaseName,
		replicated: true,
	});
	return data;
}

export function useCreateDatabaseSubmitMutation() {
	return useMutation({
		mutationFn: onCreateDatabaseSubmit,
	});
}
