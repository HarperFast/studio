import { SSHKeyName } from '@/integrations/api/instance/ssh/listSSHKeys';
import { ColumnDef } from '@tanstack/react-table';

export const dataTableColumns: Array<ColumnDef<SSHKeyName>> = [
	{
		header: 'SSH Key Name',
		accessorKey: 'name',
		enableSorting: false,
	},
];
