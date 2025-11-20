import { SchemaUser } from '@/integrations/api/api.gen';
import { ColumnDef, createColumnHelper } from '@tanstack/react-table';

const columnHelper = createColumnHelper<SchemaUser>();

export const dataTableColumns: Array<ColumnDef<SchemaUser>> = [
	{
		header: 'User Id',
		accessorKey: 'id',
		enableSorting: false,
	},
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
		cell: (props) => props.row.original.roles?.map(r => r.roleName)?.sort()?.join(', '),
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
