import { DescribeTableDataResponse } from '@/features/instance/operations/queries/getDescribeTable';
import { ColumnDef } from '@tanstack/react-table';

function formatBrowseDataTableHeader(describeTableData: DescribeTableDataResponse): {
	dataTableColumns: Array<ColumnDef<Record<string, unknown>>>; hash_attribute: string;
} {
	const { hash_attribute, attributes } = describeTableData;
	const primaryKeyColumns: ColumnDef<Record<string, unknown>>[] = [];
	const sortableColumns: ColumnDef<Record<string, unknown>>[] = [];
	const normalColumns: ColumnDef<Record<string, unknown>>[] = [];
	const timeColumns: ColumnDef<Record<string, unknown>>[] = [];
	for (let i = attributes.length - 1; i >= 0; i--) {
		const { attribute, is_primary_key, indexed } = attributes[i];

		const dataTableColumn: ColumnDef<Record<string, unknown>> = {
			header: is_primary_key ? 'Primary Key' : attribute,
			accessorKey: attribute,
			enableSorting: Boolean(is_primary_key || indexed),
		};
		if (is_primary_key) {
			primaryKeyColumns.push(dataTableColumn);
		} else if (attribute === '__createdtime__' || attribute === '__updatedtime__') {
			timeColumns.push(dataTableColumn);
		} else if (dataTableColumn.enableSorting) {
			sortableColumns.push(dataTableColumn);
		} else {
			normalColumns.push(dataTableColumn);
		}
	}
	return {
		dataTableColumns: [...primaryKeyColumns, ...sortableColumns, ...normalColumns, ...timeColumns],
		hash_attribute,
	};
}

export { formatBrowseDataTableHeader };
