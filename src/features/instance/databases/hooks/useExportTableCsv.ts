import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { buildExportGetAttributes } from '@/features/instance/databases/functions/relationshipAttributes';
import { getSchemaRelationshipsQueryOptions } from '@/features/instance/databases/functions/schemaRelationships';
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
	/** Read with `include_computed`. */
	instanceTable?: InstanceTable;
	databaseTables?: InstanceDatabaseTableMap;
}

/**
 * Shared "download this table as CSV" plumbing, lifted out of the table view so both the right-pane
 * toolbar (which passes the active filters/sort) and the tree context menu (which exports the whole
 * table) can trigger it. Fetches every row with an `Accept: text/csv` header and downloads the blob.
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
				let getAttributes = buildExportGetAttributes(instanceTable, databaseTables);
				if (getAttributes) {
					// Describe can report a declared relationship as a plain attribute, and naming one resolves it.
					const schemaRelationshipMap = await queryClient.fetchQuery(
						getSchemaRelationshipsQueryOptions(instanceParams),
					);
					getAttributes = buildExportGetAttributes(
						instanceTable,
						databaseTables,
						schemaRelationshipMap[databaseName]?.[tableName],
					);
				}
				const base = {
					...instanceParams,
					databaseName,
					tableName,
					sort: sort ?? { attribute: primaryKey, descending: false },
					pageIndex: 0,
					pageSize: 1_000_000,
					onlyIfCached: false,
					getAttributes,
					headers: { Accept: 'text/csv' },
				};
				const response = await (conditions?.length
					? getSearchByConditions({ ...base, conditions, allowFullScan })
					: getSearchByValue({ ...base, searchAttribute: primaryKey }));
				toast.loading('Preparing CSV...', { id });
				const content = response.data as unknown as string;
				const blob = new Blob([content], { type: 'text/csv' });
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
