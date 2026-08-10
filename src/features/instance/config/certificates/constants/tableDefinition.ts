import { Certificate } from '@/integrations/api/instance/certificates/listCertificates';
import { ColumnDef, createColumnHelper } from '@/lib/table';

const columnHelper = createColumnHelper<Certificate>();

export const dataTableColumns: Array<ColumnDef<Certificate>> = [
	{
		header: 'Certificate Name',
		accessorKey: 'name',
		enableSorting: true,
	},
	{
		header: 'Issuer',
		accessorKey: 'details.issuer',
		enableSorting: true,
	},
	columnHelper.display({
		header: 'Expires At',
		enableSorting: false,
		id: 'details.valid_to',
		cell: (props) =>
			props.row.original.details.valid_to ? new Date(props.row.original.details.valid_to).toLocaleString() : 'N/A',
	}),
];
