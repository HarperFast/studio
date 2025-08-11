import { useMutation } from '@tanstack/react-query';
import { instanceClient } from '@/config/instanceClient';

type DeleteTableRecordsData = {
	databaseName: string;
	tableName: string;
	hash_values: unknown[];
};

const onDeleteTableRecords = async (recordsData: DeleteTableRecordsData) => {
	const { databaseName, tableName, hash_values } = recordsData;
	const { data } = await instanceClient.post('/', {
		operation: 'delete',
		schema: databaseName,
		table: tableName,
		hash_values: hash_values,
	});
	return data;
};

const useDeleteTableRecords = () => {
	return useMutation({
		mutationFn: (recordsData: DeleteTableRecordsData) => onDeleteTableRecords(recordsData),
	});
};

export { useDeleteTableRecords };
export type { DeleteTableRecordsData };
