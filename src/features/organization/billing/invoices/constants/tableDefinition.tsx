import { Badge } from '@/components/ui/badge';
import { SchemaInvoice, SchemaInvoiceLine } from '@/integrations/api/api.gen';
import { translateStripeStatusToVariant } from '@/integrations/stripe/translateStripeStatusToVariant';
import { toUSD } from '@/lib/toUSD';
import { translateSecondsToAgo } from '@/lib/translateSecondsToAgo';
import { ColumnDef } from '@tanstack/react-table';

export const dataTableColumns: Array<ColumnDef<SchemaInvoice>> = [
	{
		header: 'Invoice Id',
		accessorKey: 'id',
		enableSorting: false,
	},
	{
		header: 'Status',
		accessorKey: 'status',
		enableSorting: false,
		cell: ({ cell }) =>
			<Badge variant={translateStripeStatusToVariant(cell.getValue<string>())}>{cell.getValue<string>()}</Badge>,
	},
	{
		header: 'Date',
		accessorKey: 'periodStart',
		enableSorting: false,
		cell: ({ cell }) => {
			const periodStart = cell.row.original.periodStart * 1000;
			const periodEnd = cell.row.original.periodEnd * 1000;
			const secondsSinceStart = (Date.now() - periodStart) / 1000;
			const secondsSinceEnd = (Date.now() - periodEnd) / 1000;
			if (Math.abs(secondsSinceStart - secondsSinceEnd) < 1000) {
				return translateSecondsToAgo(secondsSinceStart, periodStart);
			}
			return [
				periodStart ? translateSecondsToAgo(secondsSinceStart, periodStart) : '-',
				periodEnd ? translateSecondsToAgo(secondsSinceEnd, periodEnd) : '-',
			].join(' to ');
		},
	},
	{
		header: 'Amount Due',
		accessorKey: 'amountDue',
		enableSorting: false,
		cell: ({ cell }) =>
			toUSD(cell.getValue<number>() ? cell.getValue<number>() / 100 : 0),
	},
	{
		header: 'Amount Paid',
		accessorKey: 'amountPaid',
		enableSorting: false,
		cell: ({ cell }) =>
			toUSD(cell.getValue<number>() ? cell.getValue<number>() / 100 : 0),
	},
	{
		header: 'Lines',
		accessorKey: 'lines',
		enableSorting: false,
		cell: ({ cell }) => {
			const invoiceLines = cell.getValue<SchemaInvoiceLine[]>();
			const formattedLines: string[] = [];
			for (const invoiceLine of invoiceLines) {
				formattedLines.push(`${invoiceLine.quantity}x ${invoiceLine.description} @ ${toUSD(invoiceLine.amount / 100)}`);
			}
			return formattedLines.join('\n');
		},
	},
];

