import { ContactUs } from '@/components/ContactUs';
import { Loading } from '@/components/Loading';
import { SimpleBrowseDataTable } from '@/components/SimpleBrowseDataTable';
import { Button } from '@/components/ui/button';
import { dataTableColumns } from '@/features/organization/billing/invoices/constants/tableDefinition';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { getStripeInvoicesQueryOptions } from '@/integrations/stripe/useGetStripeInvoices';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { RefreshCwIcon } from 'lucide-react';

export function Invoices() {
	const { organizationId } = useParams({ strict: false });
	const { data: organization } = useQuery(getOrganizationQueryOptions(organizationId));
	const {
		data,
		refetch,
		isLoading,
		isFetching,
		isRefetching,
	} = useQuery(getStripeInvoicesQueryOptions(organization?.type !== 'ENTERPRISE' && organization?.id, false));

	const onRefreshClick = useRefreshClick(refetch);

	if (organization?.type === 'ENTERPRISE') {
		return (
			<span>
				You are part of an enterprise organization! We don&rsquo;t currently show your invoices on this page. Want to
				explore your solution with Harper more? <ContactUs />, we would love to talk!
			</span>
		);
	}
	if (isLoading) {
		return <Loading centered />;
	}
	if (!data || !data.length) {
		return (
			<span>
				Your invoices will be shown here once one is available! Want to explore your solution with Harper more?{' '}
				<ContactUs overEmail={true} />, we would love to talk!
			</span>
		);
	}
	return (
		<SimpleBrowseDataTable data={data} columns={dataTableColumns}>
			<Button variant="defaultOutline" onClick={onRefreshClick} accessKey="r" disabled={isFetching || isRefetching}>
				<RefreshCwIcon />
				<span className="hidden lg:inline-block">
					<u>R</u>efresh
				</span>
			</Button>
		</SimpleBrowseDataTable>
	);
}
