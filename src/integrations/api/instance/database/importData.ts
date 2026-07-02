import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { useMutation } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { onAddCSVDataSubmit } from './addCSVData';
import { waitForJob } from './getJob';
import { insertTableRecords } from './insertTableRecords';

export type ImportSource =
	| { kind: 'csv-data'; data: string }
	| { kind: 'csv-url'; url: string }
	| { kind: 'json-records'; records: object[] };

export interface ImportDataParams extends InstanceClientConfig {
	database: string;
	table: string;
	/** Skip the create_table round-trip when the caller already knows the table exists. */
	tableExists: boolean;
	replicated: boolean;
	source: ImportSource;
}

export interface ImportDataResult {
	message: string;
}

function extractErrorMessage(err: unknown): string {
	const axiosErr = err as AxiosError<string | { error?: string; message?: string }>;
	const data = axiosErr?.response?.data;
	if (typeof data === 'string') { return data; }
	return data?.error || data?.message || (err as Error)?.message || String(err);
}

/**
 * Loads data into a table, creating the table first when needed. CSV loads are async
 * on the Harper side (they return a job id), so this resolves only once the job
 * finishes — callers can refresh the table immediately on success.
 */
export async function importData({
	database,
	table,
	tableExists,
	replicated,
	source,
	instanceClient,
}: ImportDataParams): Promise<ImportDataResult> {
	if (!tableExists) {
		try {
			await instanceClient.post('/', {
				operation: 'create_table',
				database,
				table,
				primary_key: 'id',
				replicated,
			});
		} catch (err) {
			// The describe_all snapshot we checked against can be stale; a table created
			// elsewhere in the meantime is fine — everything else is a real failure.
			if (!/already exists/i.test(extractErrorMessage(err))) {
				throw err;
			}
		}
	}

	switch (source.kind) {
		case 'csv-data': {
			const { job_id } = await onAddCSVDataSubmit({ database, table, fileData: source.data, instanceClient });
			const job = await waitForJob({ jobId: job_id, instanceClient });
			return { message: job.message || 'CSV data imported successfully' };
		}
		case 'csv-url': {
			const { data } = await instanceClient.post<{ message: string; job_id: string }>('/', {
				operation: 'csv_url_load',
				csv_url: source.url,
				database,
				table,
				action: 'insert',
			});
			const job = await waitForJob({ jobId: data.job_id, instanceClient });
			return { message: job.message || 'CSV data imported successfully' };
		}
		case 'json-records': {
			const result = await insertTableRecords({
				databaseName: database,
				tableName: table,
				records: source.records,
				instanceClient,
			});
			const inserted = result.inserted_hashes?.length ?? 0;
			const skipped = result.skipped_hashes?.length ?? 0;
			return {
				message: skipped
					? `Inserted ${inserted} records (${skipped} skipped)`
					: `Inserted ${inserted} records`,
			};
		}
	}
}

export function useImportDataMutation() {
	return useMutation<ImportDataResult, Error, ImportDataParams>({
		mutationFn: importData,
	});
}
