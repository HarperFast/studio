import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { getSchemaRelationshipsQueryOptions } from '@/features/instance/databases/functions/schemaRelationships';
import {
	buildExportGetAttributes,
	exportedRecords,
	tableCsvBlob,
	tableCsvColumns,
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
 * table) can trigger it. Reads every matching record as JSON in one request and writes the CSV
 * here, so that it holds every property any of them carries (see DESIGN.md).
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
				const [records, schemaRelationshipMap] = await Promise.all([
					// Parsed where it arrives, so nothing holds the response text once the records exist.
					(conditions?.length
						? getSearchByConditions<unknown>({ ...base, conditions, allowFullScan })
						: getSearchByValue<unknown>({ ...base, searchAttribute: primaryKey })).then(({ data }) => {
							toast.loading('Preparing CSV...', { id });
							return exportedRecords(data);
						}),
					// Describe can report a declared relationship as a plain attribute; it stays out of the file.
					queryClient.fetchQuery(getSchemaRelationshipsQueryOptions(instanceParams)),
				]);
				const columns = tableCsvColumns(
					records,
					instanceTable,
					databaseTables,
					schemaRelationshipMap[databaseName]?.[tableName],
				);
				const blob = tableCsvBlob(records, columns);
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
