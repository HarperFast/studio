import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { getSearchByConditions, SearchCondition } from '@/integrations/api/instance/database/getSearchByConditions';
import { getSearchByValue } from '@/integrations/api/instance/database/getSearchByValue';
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
}

/**
 * Shared "download this table as CSV" plumbing, lifted out of the table view so both the right-pane
 * toolbar (which passes the active filters/sort) and the tree context menu (which exports the whole
 * table) can trigger it. Fetches every row with an `Accept: text/csv` header and downloads the blob.
 */
export function useExportTableCsv() {
	const instanceParams = useInstanceClientIdParams();
	const [isExporting, setIsExporting] = useState(false);

	const exportCsv = useCallback(
		async ({ databaseName, tableName, primaryKey, sort, conditions }: ExportTableCsvParams) => {
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
					headers: { Accept: 'text/csv' },
				};
				const response = await (conditions?.length
					? getSearchByConditions({ ...base, conditions })
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
		[instanceParams],
	);

	return { exportCsv, isExporting };
}
