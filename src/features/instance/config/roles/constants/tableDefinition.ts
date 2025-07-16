import { ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { LocalRole } from '@/lib/api.patch';
import { translateSecondsToAgo } from '@/lib/translateSecondsToAgo';

export const hashAttribute = 'username';

const columnHelper = createColumnHelper<LocalRole>();

export const dataTableColumns: Array<ColumnDef<LocalRole>> = [
	{
		header: 'Role',
		accessorKey: 'role',
		enableSorting: false,
	},
	columnHelper.display({
		header: 'Created',
		enableSorting: false,
		id: '__createdtime__',
		cell: (props) =>
			translateSecondsToAgo(
				(Date.now() - props.row.original.__createdtime__) / 1000,
				props.row.original.__createdtime__
			),
	}),
	{
		header: 'Updated',
		accessorKey: '__updatedtime__',
		enableSorting: false,
		cell: (props) =>
			translateSecondsToAgo(
				(Date.now() - props.row.original.__updatedtime__) / 1000,
				props.row.original.__updatedtime__
			),
	},
	{
		header: 'Super  User',
		accessorKey: 'super_user',
		enableSorting: false,
		cell: (props) => (props.row.original.permission.super_user ? 'Yes' : 'No'),
	},
];
