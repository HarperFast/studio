import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { MultiSelect, MultiSelectOption } from '@/features/admin/components/MultiSelect';
import { narrowsScope } from '@/features/admin/grants/lib/grantScopeRules';
import { getPlansQueryOptions } from '@/features/admin/plans/queries/getPlans';
import { getRegionsQueryOptions } from '@/features/admin/regions/queries/getRegions';
import { AdminClusterGrant } from '@/integrations/api/api.patch';
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

/**
 * Says why the save will be refused, in the terms the server uses. Removing an entry is the obvious
 * narrowing; adding a first restriction to an unscoped grant is the one that needs saying out loud,
 * since nothing was taken away.
 */
function NarrowingNote({ field, clusterId }: { field: string; clusterId: string }) {
	return (
		<p className="text-xs text-destructive">
			This narrows the {field} a grant already bound to {clusterId}{' '}
			allows. A bound grant's scope may only widen — revoke it and mint a replacement to restrict it.
		</p>
	);
}

/** Retired rows stay selectable — an existing grant may already be scoped to one. */
const withInactive = (hint: string, inactive: boolean) => (inactive ? `${hint} · inactive` : hint);

/**
 * A grant's scope: which plans and regions the cluster it authorizes may run on. Empty means any —
 * central-manager stores null for that and refuses an empty array, so nothing is sent for an empty
 * picker, and the trigger says "Any plan" rather than leaving that to be read as "none".
 *
 * Once a grant is bound to a cluster its scope may only widen — central-manager answers 409
 * otherwise, because a narrowing does nothing until that cluster's next plan change and then
 * converts it to paid. The rule is stated here, at the moment the admin makes the change, rather
 * than left to a 409 after they hit save.
 */
export function GrantScopeFields({ enabled, existing }: {
	enabled: boolean;
	/** The grant being edited, when there is one — a create has no scope history to widen from. */
	existing?: AdminClusterGrant | null;
}) {
	const { control, watch } = useFormContext<ScopeFieldValues>();
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

	// Unbound vouchers stay freely narrowable: nothing is running on them yet.
	const boundTo = existing?.clusterId ?? null;
	const planNarrows = boundTo != null && narrowsScope(existing?.allowedPlanIds, watch('allowedPlanIds'));
	const regionNarrows = boundTo != null && narrowsScope(existing?.allowedRegionIds, watch('allowedRegionIds'));

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
						{planNarrows && <NarrowingNote field="plans" clusterId={boundTo!} />}
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
						{regionNarrows && <NarrowingNote field="regions" clusterId={boundTo!} />}
					</FormItem>
				)}
			/>
		</>
	);
}
