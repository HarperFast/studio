import { ResendInviteButton } from '@/features/organization/users/components/ResendInviteButton';
import { SchemaUser } from '@/integrations/api/api.gen';
import { ColumnDef, createColumnHelper } from '@/lib/table';

const columnHelper = createColumnHelper<SchemaUser>();

export const dataTableColumns: Array<ColumnDef<SchemaUser>> = [
	{
		header: 'User Id',
		accessorKey: 'id',
		enableSorting: true,
		enableGlobalFilter: false,
	},
	{
		header: 'Email',
		accessorKey: 'email',
		enableSorting: true,
	},
	{
		header: 'First Name',
		accessorKey: 'firstname',
		enableSorting: true,
	},
	{
		header: 'Last Name',
		accessorKey: 'lastname',
		enableSorting: true,
	},
	{
		header: 'Roles',
		id: 'roles',
		accessorFn: (user) => (user.roles ?? []).map((role) => role.roleName).sort().join(', '),
		enableSorting: true,
	},
	{
		header: 'Status',
		accessorKey: 'status',
		enableSorting: true,
	},
	{
		header: 'Verified',
		accessorKey: 'isVerified',
		enableSorting: true,
	},
	columnHelper.display({
		header: '',
		enableSorting: false,
		id: 'actions',
		cell: (props) => props.row.original.status === 'PENDING' ? <ResendInviteButton user={props.row.original} /> : null,
	}),
];
