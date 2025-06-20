import { useMutation } from '@tanstack/react-query';
import { instanceClient } from '@/config/instanceClient';

type DeleteTableData = {
	databaseName: string;
	tableName: string;
};

const onDeleteTable = async (tableData: DeleteTableData) => {
	const { data } = await instanceClient.post('/', {
		operation: 'drop_table',
		schema: tableData.databaseName,
		table: tableData.tableName,
	});
	return data;
};

const useDeleteTableMutation = () => {
	return useMutation({
		mutationFn: (data: DeleteTableData) => onDeleteTable(data),
	});
};

export { useDeleteTableMutation };
export type { DeleteTableData };
