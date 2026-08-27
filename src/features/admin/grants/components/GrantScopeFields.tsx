import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { MultiSelect, MultiSelectOption } from '@/features/admin/components/MultiSelect';
import { getPlansQueryOptions } from '@/features/admin/plans/queries/getPlans';
import { getRegionsQueryOptions } from '@/features/admin/regions/queries/getRegions';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useFormContext } from 'react-hook-form';

/** The two scope arrays, which both the create and the edit form carry under these names. */
interface ScopeFieldValues {
	allowedPlanIds: string[];
	allowedRegionIds: string[];
}

/** Why the menu is empty — a failed read and an empty table are not the same thing to an admin. */
function emptyText(query: { isLoading: boolean; isError: boolean }, noun: string, permission: string): string {
	if (query.isLoading) { return `Loading ${noun}…`; }
	if (query.isError) { return `Could not load ${noun} — needs ${permission}.`; }
	return `No ${noun} exist`;
}

/** Retired rows stay selectable — an existing grant may already be scoped to one. */
const withInactive = (hint: string, inactive: boolean) => (inactive ? `${hint} · inactive` : hint);

/**
 * A grant's scope: which plans and regions the cluster it authorizes may run on. Empty means any —
 * central-manager stores null for that and refuses an empty array, so nothing is sent for an empty
 * picker, and the trigger says "Any plan" rather than leaving that to be read as "none".
 *
 * Scoping a bound grant to less than the cluster already runs is refused server-side, since an
 * uncovered plan would otherwise surface later as an unexpected conversion to paid.
 */
export function GrantScopeFields({ enabled }: { enabled: boolean }) {
	const { control } = useFormContext<ScopeFieldValues>();
	const plansQuery = useQuery({ ...getPlansQueryOptions(), enabled });
	const regionsQuery = useQuery({ ...getRegionsQueryOptions(), enabled });

	// Labelled by id, not display name: the id is what the grant stores and what the server validates
	// against, and it is what a chip has room for. The name and size ride along as the menu's hint.
	const planOptions: MultiSelectOption[] = useMemo(() =>
		[...(plansQuery.data ?? [])]
			.sort((a, b) => a.id.localeCompare(b.id))
			.map((plan) => ({
				value: plan.id,
				label: plan.id,
				hint: withInactive(plan.performanceDescription, plan.status != null && plan.status !== 'ACTIVE'),
			})), [plansQuery.data]);

	const regionOptions: MultiSelectOption[] = useMemo(() =>
		[...(regionsQuery.data ?? [])]
			.sort((a, b) => a.id.localeCompare(b.id))
			.map((region) => ({
				value: region.id,
				label: region.id,
				// instanceCount is region size — how many instances a cluster gets when it deploys here.
				hint: withInactive(
					`${region.region} · ${region.instanceCount} ${region.instanceCount === 1 ? 'instance' : 'instances'}`,
					region.active === false,
				),
			})), [regionsQuery.data]);

	return (
		<>
			<FormField
				control={control}
				name="allowedPlanIds"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Plans</FormLabel>
						<MultiSelect
							ariaLabel="Plans"
							options={planOptions}
							selected={field.value}
							onChange={field.onChange}
							placeholder="Any plan"
							emptyText={emptyText(plansQuery, 'plans', 'plan:read')}
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
						<MultiSelect
							ariaLabel="Regions"
							options={regionOptions}
							selected={field.value}
							onChange={field.onChange}
							placeholder="Any region"
							emptyText={emptyText(regionsQuery, 'regions', 'region:read')}
						/>
					</FormItem>
				)}
			/>
		</>
	);
}
