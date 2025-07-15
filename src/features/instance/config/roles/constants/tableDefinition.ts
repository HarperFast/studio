import { ColumnDef } from '@tanstack/react-table';
import { LocalRole } from '@/lib/api.patch';

export const hashAttribute = 'username';

// const columnHelper = createColumnHelper<LocalRole>();

export const dataTableColumns: Array<ColumnDef<LocalRole>> = [
	{
		header: 'Role',
		accessorKey: 'role',
		enableSorting: false,
	},
];
