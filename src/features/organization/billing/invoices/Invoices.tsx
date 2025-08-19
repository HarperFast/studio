import { Loading } from '@/components/Loading';
import { SimpleBrowseDataTable } from '@/components/SimpleBrowseDataTable';
import { Button } from '@/components/ui/button';
import { dataTableColumns } from '@/features/organization/billing/invoices/constants/tableDefinition';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { getStripeInvoicesQueryOptions } from '@/integrations/stripe/useGetStripeInvoices';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { RefreshCwIcon } from 'lucide-react';

export function Invoices() {
	const { organizationId } = useParams({ strict: false });
	const {
		data,
		refetch,
		isLoading,
		isFetching,
		isRefetching,
	} = useQuery(getStripeInvoicesQueryOptions(organizationId, false));

	const onRefreshClick = useRefreshClick(refetch);

	if (isLoading) {
		return <Loading centered />;
	}
	if (!data || !data.length) {
		return (
			<span>
				Your invoices will be shown here! Want to explore your solution with Harper
				more? <a href="https://www.harpersystems.dev/contact" target="_blank" className="underline">Contact
				us</a>, we would love to talk!
			</span>
		);
	}
	return (<SimpleBrowseDataTable data={data} columns={dataTableColumns}>
		<Button variant="defaultOutline" onClick={onRefreshClick} accessKey="r" disabled={isFetching || isRefetching}>
			<RefreshCwIcon />
			<span className="hidden lg:inline-block">
				<u>R</u>efresh
			</span>
		</Button>
	</SimpleBrowseDataTable>);
}
