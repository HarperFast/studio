import { SchemaUser } from '@/lib/api.gen';
import { ColumnDef, createColumnHelper } from '@tanstack/react-table';

const columnHelper = createColumnHelper<SchemaUser>();

export const dataTableColumns: Array<ColumnDef<SchemaUser>> = [
	{
		header: 'Email',
		accessorKey: 'email',
		enableSorting: false,
	},
	{
		header: 'First Name',
		accessorKey: 'firstname',
		enableSorting: false,
	},
	{
		header: 'Last Name',
		accessorKey: 'lastname',
		enableSorting: false,
	},
	columnHelper.display({
		header: 'Roles',
		enableSorting: false,
		id: 'roles',
		cell: (props) => props.row.original.roles?.map(r => r.roleName)?.join(' / '),
	}),
	{
		header: 'Status',
		accessorKey: 'status',
		enableSorting: false,
	},
	{
		header: 'Verified',
		accessorKey: 'isVerified',
		enableSorting: false,
	},
];
