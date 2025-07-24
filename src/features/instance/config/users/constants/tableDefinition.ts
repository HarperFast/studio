import { ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { LocalUser } from '@/lib/api.patch';
import { translateSecondsToAgo } from '@/lib/translateSecondsToAgo';

const columnHelper = createColumnHelper<LocalUser>();

export const dataTableColumns: Array<ColumnDef<LocalUser>> = [
	{
		header: 'Username',
		accessorKey: 'username',
		enableSorting: false,
	},
	columnHelper.display({
		header: 'Role',
		enableSorting: false,
		id: 'role',
		cell: (props) => props.row.original.role.role,
	}),
	{
		header: 'Active',
		accessorKey: 'active',
		enableSorting: false,
	},
	columnHelper.display({
		header: 'Created',
		enableSorting: false,
		id: '__createdtime__',
		cell: (props) => translateSecondsToAgo((Date.now() - props.row.original.__createdtime__) / 1000, props.row.original.__createdtime__),
	}),
	{
		header: 'Updated',
		accessorKey: '__updatedtime__',
		enableSorting: false,
		cell: (props) => translateSecondsToAgo((Date.now() - props.row.original.__updatedtime__) / 1000, props.row.original.__updatedtime__),
	},
];
