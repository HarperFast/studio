import { ColumnDef, createColumnHelper } from '@tanstack/react-table';
import { LocalRole } from '@/lib/api.patch';
import { translateSecondsToAgo } from '@/lib/translateSecondsToAgo';

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
	columnHelper.display({
		header: 'Updated',
		id: '__updatedtime__',
		enableSorting: false,
		cell: (props) =>
			translateSecondsToAgo(
				(Date.now() - props.row.original.__updatedtime__) / 1000,
				props.row.original.__updatedtime__
			),
	}),
	columnHelper.display({
		header: 'Super  User',
		id: 'super_user',
		enableSorting: false,
		cell: (props) => (props.row.original.permission.super_user ? 'Yes' : 'No'),
	}),
	columnHelper.display({
		header: 'Structure  User',
		id: 'structure_user',
		enableSorting: false,
		cell: (props) => (props.row.original.permission.structure_user ? 'Yes' : 'No'),
	}),
];
