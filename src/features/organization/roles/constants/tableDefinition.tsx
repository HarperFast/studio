import { SchemaOrganizationRole } from '@/integrations/api/api.gen';
import { ColumnDef, createColumnHelper } from '@tanstack/react-table';

const columnHelper = createColumnHelper<SchemaOrganizationRole>();

export const dataTableColumns: Array<ColumnDef<SchemaOrganizationRole>> = [
	{
		header: 'Role Name',
		accessorKey: 'roleName',
		enableSorting: false,
	},
	columnHelper.display({
		header: 'ID',
		id: 'id',
		enableSorting: false,
		// Role names are not unique; surfacing the id makes roles that share a name distinguishable.
		cell: (props) => (
			<span className="font-mono text-xs text-muted-foreground" title={props.row.original.id}>
				{props.row.original.id}
			</span>
		),
	}),
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
