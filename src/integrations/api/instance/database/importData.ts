import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { NO_VERDICT_STATUSES } from '@/integrations/api/unansweredWrite';
import { errorText } from '@/lib/errorText';
import { type QueryClient, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError, isAxiosError } from 'axios';
import { onAddCSVDataSubmit } from './addCSVData';
import { type HarperJob, waitForJob } from './getJob';
import { insertTableRecords } from './insertTableRecords';

export type ImportSource =
	| { kind: 'csv-data'; data: string }
	| { kind: 'csv-url'; url: string }
	| { kind: 'json-records'; records: object[] };

export interface ImportDataParams extends InstanceClientIdConfig {
	database: string;
	table: string;
	/** Skip the create_table round-trip when the caller already knows the table exists. */
	tableExists: boolean;
	replicated: boolean;
	source: ImportSource;
	progress?: ImportProgressListener;
}

export interface ImportDataResult {
	message: string;
}

/**
 * Follows one import. The mutation's own callbacks settle it, not the caller's `mutate` options, which
 * React Query skips once the component that started the import has unmounted.
 */
export interface ImportProgressListener {
	/** Every poll of a CSV load's job. A JSON-records import runs no job, so it never calls this. */
	onJobUpdate(job: HarperJob): void;
	onSuccess(result: ImportDataResult): void;
	onError(): void;
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
 * finishes. {@link useImportDataMutation} re-reads the table when it does.
 */
export async function importData({
	database,
	table,
	tableExists,
	replicated,
	source,
	instanceClient,
	progress,
}: ImportDataParams): Promise<ImportDataResult> {
	const onUpdate = (job: HarperJob) => progress?.onJobUpdate(job);
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

	// A new source needs its operation added to checkOperationPermission's import mapping, or the
	// launcher stays hidden for roles granted only that operation.
	switch (source.kind) {
		case 'csv-data': {
			const { job_id } = await onAddCSVDataSubmit({ database, table, fileData: source.data, instanceClient });
			const job = await waitForJob({ jobId: job_id, instanceClient, onUpdate });
			return { message: errorText(job.message) ?? 'CSV data imported successfully' };
		}
		case 'csv-url': {
			const { data } = await instanceClient.post<{ message: string; job_id: string }>('/', {
				operation: 'csv_url_load',
				csv_url: source.url,
				database,
				table,
				action: 'insert',
			});
			const job = await waitForJob({ jobId: data.job_id, instanceClient, onUpdate });
			return { message: errorText(job.message) ?? 'CSV data imported successfully' };
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

/** A throw from a mutation callback becomes the mutation's error, so a progress listener or a refresh
 *  that fails would report an import Harper completed as failed and invite a duplicating retry. */
function settleQuietly(what: string, settle: () => void) {
	try {
		settle();
	} catch (err) {
		console.debug(`${what} failed`, err);
	}
}

/** describe_table sits under the prefix, and the database overview totals its counts. describe_all
 *  gains the table when the import created it. */
function refreshImportedTable(
	queryClient: QueryClient,
	{ entityId, database, table }: Pick<ImportDataParams, 'entityId' | 'database' | 'table'>,
	refetchNow: boolean,
) {
	void queryClient.invalidateQueries({
		queryKey: [entityId, database, table],
		refetchType: refetchNow ? 'active' : 'none',
	});
	void queryClient.invalidateQueries({
		queryKey: [entityId, 'describe_all'],
		refetchType: refetchNow ? 'all' : 'none',
	});
}

/**
 * Resolves once the describe_all refetch {@link useImportDataMutation} started has settled, joining it
 * rather than replacing it, so navigating to a table the import created finds it in the map instead of
 * being redirected off it (`resolveDatabasesRedirect`). A refetch that fails still resolves, and leaves
 * the old map.
 */
export function awaitDatabaseMapRefresh(queryClient: QueryClient, entityId: ImportDataParams['entityId']) {
	return queryClient.invalidateQueries(
		{ queryKey: [entityId, 'describe_all'], refetchType: 'all' },
		{ cancelRefetch: false },
	);
}

/**
 * Any outcome can have changed the table: a job that ended in `ERROR` keeps the chunks `csv_url_load`
 * wrote before the failing one (harper `dataLayer/bulkLoad.ts`, `insertChunk`), and a refused load can
 * follow the `create_table` that made its table. But without a verdict (no response, or a 502/503/504)
 * re-reading now would fail the same way and stack its own error toasts on the import's, so the reads
 * are only marked stale.
 */
function instanceAnswered(error: Error | null): boolean {
	if (!isAxiosError(error)) {
		return true;
	}
	const status = error.response?.status;
	return status !== undefined && !NO_VERDICT_STATUSES.has(status);
}

export function useImportDataMutation() {
	const queryClient = useQueryClient();
	return useMutation<ImportDataResult, Error, ImportDataParams>({
		mutationFn: importData,
		onSuccess: (result, { progress }) => settleQuietly('Import progress listener', () => progress?.onSuccess(result)),
		onError: (_error, { progress }) => settleQuietly('Import progress listener', () => progress?.onError()),
		// Not awaited, so a slow re-read cannot hold the modal on "Importing…". See the databases DESIGN.md.
		onSettled: (_result, error, params) =>
			settleQuietly(
				'Refreshing the imported table',
				() => refreshImportedTable(queryClient, params, instanceAnswered(error)),
			),
	});
}
