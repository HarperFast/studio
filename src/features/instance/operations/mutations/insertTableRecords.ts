import { useMutation } from '@tanstack/react-query';
import { instanceClient } from '@/config/instanceClient';

type InsertTableRecordsData = {
	databaseName: string;
	tableName: string;
	records: object[];
};

const onInsertTableRecords = async (recordsData: InsertTableRecordsData) => {
	const { databaseName, tableName, records } = recordsData;
	const { data } = await instanceClient.post('/', {
		operation: 'insert',
		database: databaseName,
		table: tableName,
		records: records,
	});
	return data;
};

const useInsertTableRecords = () => {
	return useMutation({
		mutationFn: (recordsData: InsertTableRecordsData) => onInsertTableRecords(recordsData),
	});
};

export { useInsertTableRecords };
export type { InsertTableRecordsData };
