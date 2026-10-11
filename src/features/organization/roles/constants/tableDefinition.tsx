import { SchemaOrganizationRole } from '@/integrations/api/api.gen';
import { ColumnDef } from '@/lib/table';

function assignedUserCount(role: SchemaOrganizationRole) {
	return role.userIds?.length ?? 0;
}

export const dataTableColumns: Array<ColumnDef<SchemaOrganizationRole>> = [
	{
		header: 'Role Name',
		accessorKey: 'roleName',
		enableSorting: true,
	},
	{
		header: 'ID',
		accessorKey: 'id',
		enableSorting: true,
		enableGlobalFilter: false,
		// Role names are not unique; surfacing the id makes roles that share a name distinguishable.
		cell: (props) => (
			<span className="font-mono text-xs text-muted-foreground" title={props.row.original.id}>
				{props.row.original.id}
			</span>
		),
	},
	{
		header: 'Users Assigned',
		id: 'userIds',
		accessorFn: assignedUserCount,
		enableSorting: true,
		enableGlobalFilter: false,
		cell: (props) => assignedUserCount(props.row.original) || 'No users assigned',
	},
];
