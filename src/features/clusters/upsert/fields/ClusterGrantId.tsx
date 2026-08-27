import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { UpsertClusterSchema } from '@/features/clusters/upsert/upsertClusterSchema';
import { useStaffPermission } from '@/hooks/useAuth';
import { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

/**
 * Claim an unbound grant for the cluster being created. `POST /Cluster` takes `grantId` and binds
 * the voucher in place of a payment method; without this field nothing in studio can redeem a grant
 * minted against an organization.
 *
 * Staff-only, quiet, and unexplained on purpose: customer-facing redemption has not been designed,
 * and every way a claim can fail comes back as a central-manager message the shared error toast
 * already shows. The server scopes the claim to the caller's own organization either way.
 */
export function ClusterGrantId({
	className,
	form,
}: {
	className: string;
	form: UseFormReturn<z.infer<typeof UpsertClusterSchema>>;
}) {
	const canReadGrants = useStaffPermission('grant:read');
	if (!canReadGrants) { return null; }

	return (
		<FormField
			control={form.control}
			name="grantId"
			render={({ field }) => (
				<FormItem className={className}>
					<FormLabel className="pb-1">Voucher ID</FormLabel>
					<FormControl>
						<Input type="text" {...field} value={field.value ?? ''} />
					</FormControl>
					<FormMessage />
				</FormItem>
			)}
		/>
	);
}
