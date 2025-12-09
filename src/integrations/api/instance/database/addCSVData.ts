import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';

export interface AddCSVDataFormData {
	database: string;
	table: string;
	fileData: string;
}
export interface AddCSVDataResponse {
	message: string;
	job_id: string;
}

export async function onAddCSVDataSubmit(formData: AddCSVDataFormData & InstanceClientConfig) {
	const { database, table, fileData, instanceClient } = formData;
	const { data } = await instanceClient.post(
		'/',
		{
			operation: 'csv_data_load',
			database,
			action: 'insert',
			table,
			data: fileData,
		},
	);
	return data;
}

export function useAddCSVDataMutation() {
	return useMutation<AddCSVDataResponse, Error, AddCSVDataFormData & InstanceClientConfig>({
		mutationFn: onAddCSVDataSubmit,
	});
}
