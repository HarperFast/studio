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
 * the voucher instead of asking for a payment method; without one, nothing in studio can redeem a
 * grant minted against an organization.
 *
 * Staff-only for now: an unbound grant is something an admin mints, and customer-facing redemption
 * (wording, where it sits in the flow) has not been designed. The server scopes the claim to the
 * caller's own organization either way.
 *
 * Every way a claim can fail — unknown id, another org's grant, already claimed, lapsed, or a scope
 * that doesn't cover the chosen plans — comes back as a message from central-manager, which the
 * shared mutation error toast shows verbatim.
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
					<FormLabel className="pb-1">Grant ID</FormLabel>
					<FormControl>
						<Input type="text" placeholder="cgr-… (optional)" {...field} value={field.value ?? ''} />
					</FormControl>
					<p className="text-xs font-light text-muted-foreground">
						Claims an unbound grant for this cluster in place of a payment method. It must belong to this organization,
						be unclaimed and live, and its scope must cover the plans and regions chosen above.
					</p>
					<FormMessage />
				</FormItem>
			)}
		/>
	);
}
