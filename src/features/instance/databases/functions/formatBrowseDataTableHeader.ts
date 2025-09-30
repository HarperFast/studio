import { InstanceAttribute, InstanceTable } from '@/lib/api.patch';
import { ColumnDef } from '@tanstack/react-table';

export function formatBrowseDataTableHeader(instanceTable: InstanceTable): {
	dataTableColumns: Array<ColumnDef<Record<string, unknown>>>;
	hashAttribute: string;
} {
	const { hash_attribute: hashAttribute, attributes } = instanceTable;
	const primaryKeyColumns: ColumnDef<Record<string, unknown>>[] = [];
	const sortableColumns: ColumnDef<Record<string, unknown>>[] = [];
	const normalColumns: ColumnDef<Record<string, unknown>>[] = [];
	const timeColumns: ColumnDef<Record<string, unknown>>[] = [];
	for (let i = attributes.length - 1; i >= 0; i--) {
		const { attribute, type, is_primary_key, indexed } = attributes[i];

		const dataTableColumn: ColumnDef<Record<string, unknown>> = {
			header: attribute,
			accessorKey: attribute,
			enableSorting: Boolean(is_primary_key || indexed),
			enableResizing: true,
			size: sizeByAttributeType(type),
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
		hashAttribute,
	};
}

function sizeByAttributeType(type: InstanceAttribute['type']) {
	switch (type) {
		case 'Id':
		case 'ID':
			return 1;
		case 'Boolean':
			return 1;
		case 'Int':
		case 'Long':
		case 'Float':
		case 'BigInt':
			return 1;
		case 'Date':
		case 'String':
		default:
			return Math.round(window.innerWidth * 0.1);
	}
}
