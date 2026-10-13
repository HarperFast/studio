import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { getSchemaRelationshipsQueryOptions } from '@/features/instance/databases/functions/schemaRelationships';
import {
	buildExportGetAttributes,
	exportedRecords,
	tableCsvColumns,
	tableCsvLines,
} from '@/features/instance/databases/functions/tableCsv';
import { InstanceDatabaseTableMap, InstanceTable } from '@/integrations/api/api.patch';
import { getSearchByConditions, SearchCondition } from '@/integrations/api/instance/database/getSearchByConditions';
import { getSearchByValue } from '@/integrations/api/instance/database/getSearchByValue';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

interface ExportTableCsvParams {
	databaseName: string;
	tableName: string;
	primaryKey: string;
	/** Defaults to primary-key order (natural order) when omitted. */
	sort?: { attribute: string; descending: boolean };
	/** When provided, exports the filtered result set; otherwise the whole table. */
	conditions?: SearchCondition[] | null;
	/** The user agreed that `conditions` may read every record. */
	allowFullScan?: boolean;
	/** Read with `include_computed`: its attributes are the file's first columns, in this order. */
	instanceTable?: InstanceTable;
	databaseTables?: InstanceDatabaseTableMap;
}

/**
 * Shared "download this table as CSV" plumbing, lifted out of the table view so both the right-pane
 * toolbar (which passes the active filters/sort) and the tree context menu (which exports the whole
 * table) can trigger it. Fetches every matching record as JSON in one request, with the grid's
 * select minus relationships, and writes the CSV here: its columns are the described attributes,
 * then every property any of those records carries that describe doesn't list. Harper's own
 * `text/csv` answer fixes its header before the first row, so it can't (see `buildExportGetAttributes`).
 */
export function useExportTableCsv() {
	const instanceParams = useInstanceClientIdParams();
	const queryClient = useQueryClient();
	const [isExporting, setIsExporting] = useState(false);

	const exportCsv = useCallback(
		async (
			{ databaseName, tableName, primaryKey, sort, conditions, allowFullScan, instanceTable, databaseTables }:
				ExportTableCsvParams,
		) => {
			if (!primaryKey) {
				toast.error(`Cannot export "${tableName}": no primary key found.`);
				return;
			}
			const id = toast.loading('Loading CSV...');
			setIsExporting(true);
			try {
				const base = {
					...instanceParams,
					databaseName,
					tableName,
					sort: sort ?? { attribute: primaryKey, descending: false },
					pageIndex: 0,
					pageSize: 1_000_000,
					onlyIfCached: false,
					getAttributes: buildExportGetAttributes(instanceTable),
					// Parsed here, so an integer too large for a double keeps its digits.
					responseType: 'text' as const,
				};
				const [response, schemaRelationshipMap] = await Promise.all([
					conditions?.length
						? getSearchByConditions<unknown>({ ...base, conditions, allowFullScan })
						: getSearchByValue<unknown>({ ...base, searchAttribute: primaryKey }),
					// Describe can report a declared relationship as a plain attribute; it stays out of the file.
					queryClient.fetchQuery(getSchemaRelationshipsQueryOptions(instanceParams)),
				]);
				toast.loading('Preparing CSV...', { id });
				const records = exportedRecords(response.data);
				const columns = tableCsvColumns(
					records,
					instanceTable,
					databaseTables,
					schemaRelationshipMap[databaseName]?.[tableName],
				);
				const blob = new Blob(tableCsvLines(records, columns), { type: 'text/csv' });
				const url = URL.createObjectURL(blob);
				const downloadLink = document.createElement('a');
				downloadLink.href = url;
				downloadLink.setAttribute('download', `${databaseName}.${tableName}.${new Date().toISOString()}.csv`);
				downloadLink.click();
				// Defer revocation: revoking synchronously can cancel the download before some browsers
				// (Firefox, iOS Safari) have started fetching the blob.
				setTimeout(() => URL.revokeObjectURL(url), 1000);
				toast.success('CSV Exported!', { id });
			} catch (err) {
				toast.error(err instanceof Error ? err.message : 'Failed to export CSV', { id });
			} finally {
				setIsExporting(false);
			}
		},
		[instanceParams, queryClient],
	);

	return { exportCsv, isExporting };
}
