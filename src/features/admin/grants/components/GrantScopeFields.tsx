import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { ScopeOption, ScopePicker } from '@/features/admin/grants/components/ScopePicker';
import { getPlansQueryOptions } from '@/features/admin/plans/queries/getPlans';
import { getRegionsQueryOptions } from '@/features/admin/regions/queries/getRegions';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useFormContext } from 'react-hook-form';

/** Why the box is empty — a failed read and an empty table are not the same thing to an admin. */
function emptyLabel(query: { isLoading: boolean; isError: boolean }, noun: string, permission: string): string {
	if (query.isLoading) { return `Loading ${noun}…`; }
	if (query.isError) { return `Could not load ${noun} — needs ${permission}.`; }
	return `No ${noun} exist.`;
}

/** The two scope arrays, which both the create and the edit form carry under these names. */
interface ScopeFieldValues {
	allowedPlanIds: string[];
	allowedRegionIds: string[];
}

/**
 * A grant's scope: which plans and regions the cluster it authorizes may run on. Empty means any —
 * central-manager stores null for that and refuses an empty array, so nothing is sent for an empty
 * box.
 *
 * Scoping a bound grant to less than the cluster already runs is refused server-side, since an
 * uncovered plan would otherwise surface later as an unexpected conversion to paid.
 */
export function GrantScopeFields({ enabled }: { enabled: boolean }) {
	const { control } = useFormContext<ScopeFieldValues>();
	const plansQuery = useQuery({ ...getPlansQueryOptions(), enabled });
	const regionsQuery = useQuery({ ...getRegionsQueryOptions(), enabled });
	const plans = plansQuery.data;
	const regions = regionsQuery.data;

	// Both lists are labelled by id, not display name: the id is what a grant stores and what the
	// server validates against, and for plans it is also the shorter, more distinct of the two —
	// every plan name carries the same "Fabric Managed Service …" prefix. Sorting by id keeps each
	// family (dedicated, block level, self-hosted) together.
	const planOptions: ScopeOption[] = useMemo(() =>
		[...(plans ?? [])]
			.sort((a, b) => a.id.localeCompare(b.id))
			.map((plan) => ({
				id: plan.id,
				label: plan.id,
				hint: plan.performanceDescription,
				inactive: plan.status != null && plan.status !== 'ACTIVE',
			})), [plans]);

	const regionOptions: ScopeOption[] = useMemo(() =>
		[...(regions ?? [])]
			.sort((a, b) => a.id.localeCompare(b.id))
			.map((region) => ({
				id: region.id,
				label: region.id,
				hint: region.region,
				// Region size, not occupancy: instanceCount is how many instances a cluster gets when
				// it deploys here, which is what makes one region a bigger commitment than another.
				meta: `${region.instanceCount} ${region.instanceCount === 1 ? 'instance' : 'instances'}`,
				title: `${region.instanceCount} instance(s) per cluster deployed in ${region.id}`,
				inactive: region.active === false,
			})), [regions]);

	return (
		<>
			<FormField
				control={control}
				name="allowedPlanIds"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Plans</FormLabel>
						<ScopePicker
							ariaLabel="Plans"
							options={planOptions}
							value={field.value}
							onChange={field.onChange}
							unrestrictedLabel="Any plan"
							emptyLabel={emptyLabel(plansQuery, 'plans', 'plan:read')}
						/>
					</FormItem>
				)}
			/>

			<FormField
				control={control}
				name="allowedRegionIds"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Regions</FormLabel>
						<ScopePicker
							ariaLabel="Regions"
							options={regionOptions}
							value={field.value}
							onChange={field.onChange}
							unrestrictedLabel="Any region"
							emptyLabel={emptyLabel(regionsQuery, 'regions', 'region:read')}
						/>
					</FormItem>
				)}
			/>
		</>
	);
}
