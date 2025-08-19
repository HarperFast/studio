import { Button } from '@/components/ui/button';
import { DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { PaymentMethodsDisplay } from '@/features/organization/billing/paymentMethod/PaymentMethodsDisplay';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';

interface ClusterBillingProps {
	isPending: boolean;
}

export function ClusterBilling({ isPending }: ClusterBillingProps) {
	const { organizationId } = useParams({ strict: false });
	const { data: organization } = useQuery(getOrganizationQueryOptions(organizationId));
	const billing = organization?.billing;
	const hasValidPaymentMethod = billing?.paymentMethod?.status === 'pass';

	return (<>
		<ul className="list-disc ml-6">
			<li>You will be billed for this cluster today, and will receive a license for the
				block of usage you've requested.
			</li>
			<li>When that block is used up, or 3 months elapse, you will be automatically
				renewed.
			</li>
		</ul>

		<DialogDescription>Payment method:</DialogDescription>

		<div className="overflow-auto max-h-[calc(100vh-theme(spacing.96))]">
			<PaymentMethodsDisplay />
		</div>

		{hasValidPaymentMethod && (<>
			<DialogDescription>Ready to create your new cluster?</DialogDescription>

			<DialogFooter className="mt-3">
				<Button type="submit" variant="submit" className="rounded-full" disabled={isPending}>
					Create New Cluster <ArrowRight />
				</Button>
			</DialogFooter>
		</>)}
	</>);
}
