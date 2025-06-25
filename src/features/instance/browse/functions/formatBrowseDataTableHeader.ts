import { DescribeTableDataResponse } from '@/features/instance/operations/queries/getDescribeTable';
import { ColumnDef } from '@tanstack/react-table';

function formatBrowseDataTableHeader(describeTableData: DescribeTableDataResponse): {
	dataTableColumns: Array<ColumnDef<Record<string, unknown>>>; hash_attribute: string;
} {
	const { hash_attribute, attributes } = describeTableData;
	const dataTableColumns: ColumnDef<Record<string, unknown>>[] = [];
	for (let i = attributes.length - 1; i >= 0; i--) {
		const { attribute, is_primary_key, indexed } = attributes[i];

		const dataTableColumn: ColumnDef<Record<string, unknown>> = {
			header: attribute === 'id' ? 'Primary Key' : attribute,
			accessorKey: attribute,
			enableSorting: Boolean(is_primary_key || indexed),
		};
		if (attribute === '__createdtime__' || attribute === '__updatedtime__') {
			dataTableColumns.push(dataTableColumn);
		} else {
			dataTableColumns.unshift(dataTableColumn);
		}
	}
	return {
		dataTableColumns,
		hash_attribute,
	};
}

export { formatBrowseDataTableHeader };
