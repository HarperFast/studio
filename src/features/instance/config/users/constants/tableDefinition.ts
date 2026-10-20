import { LocalUser } from '@/integrations/api/api.patch';
import { ColumnDef } from '@/lib/table';
import { translateSecondsToAgo } from '@/lib/translateSecondsToAgo';

export const dataTableColumns: Array<ColumnDef<LocalUser>> = [
	{
		header: 'Username',
		accessorKey: 'username',
		enableSorting: true,
	},
	{
		header: 'Role',
		id: 'role',
		accessorFn: (user) => user.role.role,
		enableSorting: true,
	},
	{
		header: 'Active',
		accessorKey: 'active',
		enableSorting: true,
	},
	{
		header: 'Created',
		accessorKey: '__createdtime__',
		enableSorting: true,
		enableGlobalFilter: false,
		cell: (props) =>
			translateSecondsToAgo(
				(Date.now() - props.row.original.__createdtime__) / 1000,
				props.row.original.__createdtime__,
			),
	},
	{
		header: 'Updated',
		accessorKey: '__updatedtime__',
		enableSorting: true,
		enableGlobalFilter: false,
		cell: (props) =>
			translateSecondsToAgo(
				(Date.now() - props.row.original.__updatedtime__) / 1000,
				props.row.original.__updatedtime__,
			),
	},
];
