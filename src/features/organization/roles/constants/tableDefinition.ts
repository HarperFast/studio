import { SchemaOrganizationRole } from '@/integrations/api/api.gen';
import { ColumnDef, createColumnHelper } from '@tanstack/react-table';

export const hashAttribute = 'username';

const columnHelper = createColumnHelper<SchemaOrganizationRole>();

export const dataTableColumns: Array<ColumnDef<SchemaOrganizationRole>> = [
	{
		header: 'Role Name',
		accessorKey: 'roleName',
		enableSorting: false,
	},
	columnHelper.display({
		header: 'Users Assigned',
		enableSorting: false,
		id: 'userIds',
		cell: (props) => {
			if (!props.row.original.userIds || props.row.original.userIds.length === 0) {
				return 'No users assigned';
			}
			return props.row.original.userIds.length;
		},
	}),
];
