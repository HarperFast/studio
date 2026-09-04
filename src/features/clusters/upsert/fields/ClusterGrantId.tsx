import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { voucherLabel } from '@/features/clusters/lib/grantExpiry';
import { UpsertClusterSchema } from '@/features/clusters/upsert/upsertClusterSchema';
import { useStaffPermission } from '@/hooks/useAuth';
import { ClusterGrant } from '@/integrations/api/api.patch';
import { UseFormReturn } from 'react-hook-form';
import { z } from 'zod';

/** Radix Select refuses an empty item value, so "no voucher" needs a stand-in. Grant ids are cgr-. */
const NONE = 'none';

/**
 * Claim an unbound grant for the cluster being created. `POST /Cluster` takes `grantId` and binds
 * the voucher in place of a payment method.
 *
 * Two faces. When the organization holds unclaimed vouchers, any member who can create a cluster
 * picks from them — the server scopes the claim to the caller's organization, so listing them is
 * safe. When it holds none, staff keep a bare id field for a voucher the org read has not caught up
 * with; a customer sees nothing, since there is nothing they could redeem.
 */
export function ClusterGrantId({
	className,
	form,
	unboundGrants,
	planNameById = {},
	regionNameById = {},
}: {
	className: string;
	form: UseFormReturn<z.infer<typeof UpsertClusterSchema>>;
	unboundGrants?: ClusterGrant[];
	planNameById?: Record<string, string>;
	regionNameById?: Record<string, string>;
}) {
	const canReadGrants = useStaffPermission('grant:read');
	const vouchers = unboundGrants ?? [];

	if (vouchers.length === 0) {
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

	return (
		<FormField
			control={form.control}
			name="grantId"
			render={({ field }) => {
				const picked = vouchers.find((grant) => grant.id === field.value);
				return (
					<FormItem className={className}>
						<FormLabel className="pb-1">Voucher</FormLabel>
						<FormControl>
							<Select
								value={field.value || NONE}
								onValueChange={(value) => {
									field.onChange(value === NONE ? '' : value);
									void form.trigger();
								}}
							>
								<SelectTrigger className="w-full" aria-label="Voucher">
									<SelectValue placeholder="None" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={NONE}>None</SelectItem>
									{vouchers.map((grant) => (
										<SelectItem key={grant.id} value={grant.id}>
											{voucherLabel(grant)} <span className="font-light opacity-50">{grant.id}</span>
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</FormControl>
						{picked && <Covers grant={picked} planNameById={planNameById} regionNameById={regionNameById} />}
						<FormMessage />
					</FormItem>
				);
			}}
		/>
	);
}

/**
 * What a scoped voucher will accept, said before submit: the server refuses a plan or region the
 * grant does not name, and that refusal would otherwise be the first the customer heard of it.
 */
function Covers(
	{ grant, planNameById, regionNameById }: {
		grant: ClusterGrant;
		planNameById: Record<string, string>;
		regionNameById: Record<string, string>;
	},
) {
	const plans = grant.allowedPlanIds?.map((id) => planNameById[id] ?? id) ?? [];
	const regions = grant.allowedRegionIds?.map((id) => regionNameById[id] ?? id) ?? [];
	if (plans.length === 0 && regions.length === 0) { return null; }
	const scope = [
		plans.length > 0 && plans.join(', '),
		regions.length > 0 && `in ${regions.join(', ')}`,
	].filter(Boolean).join(' ');
	return <p className="text-xs text-muted-foreground">Covers {scope}</p>;
}
