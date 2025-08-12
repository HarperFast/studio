import { useMutation } from '@tanstack/react-query';
import { instanceClient } from '@/config/instanceClient';

type UpdateTableRecordsData = {
	databaseName: string;
	tableName: string;
	records: object[];
};

const onUpdateTableRecords = async (recordsData: UpdateTableRecordsData) => {
	const { databaseName, tableName, records } = recordsData;
	const { data } = await instanceClient.post('/', {
		operation: 'update',
		database: databaseName,
		table: tableName,
		records: records,
	});
	return data;
};

const useUpdateTableRecords = () => {
	return useMutation({
		mutationFn: (recordsData: UpdateTableRecordsData) => onUpdateTableRecords(recordsData),
	});
};

export { useUpdateTableRecords };
export type { UpdateTableRecordsData };
