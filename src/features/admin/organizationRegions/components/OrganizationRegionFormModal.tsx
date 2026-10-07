import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
	useCreateOrganizationRegionMutation,
	useUpdateOrganizationRegionMutation,
} from '@/features/admin/organizationRegions/mutations/useOrganizationRegionMutations';
import {
	FROZEN_WHILE_REFERENCED,
	NO_FALLBACK,
	OrganizationRegionFormSchema,
	OrganizationRegionFormValues,
	toCreatePayload,
	toFormValues,
	toPatch,
} from '@/features/admin/organizationRegions/OrganizationRegionFormSchema';
import {
	getOrganizationRegionQueryOptions,
	organizationRegionQueryKey,
	organizationRegionsQueryKey,
} from '@/features/admin/organizationRegions/queries/getOrganizationRegions';
import { DatacenterCountSummary } from '@/features/admin/regions/components/DatacenterCountSummary';
import { MultiSelect, MultiSelectOption } from '@/features/admin/regions/components/MultiSelect';
import { getLocationsQueryOptions } from '@/features/admin/regions/queries/getLocations';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { OrganizationRegion } from '@/integrations/api/api.patch';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

/** The literal the Select uses for "no fallback": Radix rejects an empty-string item value. */
const FORCED_OPTION = '__forced__';

interface OrganizationRegionFormModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	/** The region being edited; omit/null to create a new one. */
	region?: OrganizationRegion | null;
	/** Called with the created or updated row, after the caches are invalidated. */
	onSaved?: (region: OrganizationRegion) => void;
}

function describeApiError(error: unknown): string {
	if (isAxiosError(error)) {
		const title = (error.response?.data as { title?: string } | undefined)?.title;
		if (title) {
			return title;
		}
	}
	return error instanceof Error ? error.message : 'Request failed';
}

export function OrganizationRegionFormModal(
	{ open, onOpenChange, organizationId, region, onSaved }: OrganizationRegionFormModalProps,
) {
	const isEdit = !!region;
	const queryClient = useQueryClient();

	const { data: locations = [] } = useQuery({ ...getLocationsQueryOptions(), enabled: open });
	// The organization's channel decides which provider list places instances; the other is inert.
	const { data: organization } = useQuery({ ...getOrganizationQueryOptions(organizationId), enabled: open });
	const provider: 'linode' | 'gcp' = organization?.channel === 'Akamai' ? 'linode' : 'gcp';
	const providerLabel = provider === 'linode' ? 'Linode' : 'GCP';
	const providerField = provider === 'linode' ? 'linodeDatacenters' : 'gcpDatacenters';
	// The list row carries no `clusters`; the by-id read does, and it decides which fields are frozen.
	const { data: regionWithClusters } = useQuery({
		...getOrganizationRegionQueryOptions(region?.id),
		enabled: open && isEdit,
	});
	const referencingClusters = regionWithClusters?.clusters ?? [];
	const frozen = referencingClusters.length > 0;

	const { mutate: createRegion, isPending: isCreating } = useCreateOrganizationRegionMutation();
	const { mutate: updateRegion, isPending: isUpdating } = useUpdateOrganizationRegionMutation();
	const isPending = isCreating || isUpdating;

	const linodeOptions = useMemo<MultiSelectOption[]>(
		() =>
			locations
				.filter((l) => l.cloudProvider === 'linode')
				.map((l) => ({ value: l.location, label: `${l.locationName} (${l.location})` })),
		[locations],
	);
	const gcpOptions = useMemo<MultiSelectOption[]>(
		() =>
			locations
				.filter((l) => l.cloudProvider === 'gcp')
				.map((l) => ({ value: l.location, label: `${l.locationName} (${l.location})` })),
		[locations],
	);
	const fallbackOptions = useMemo<string[]>(() => {
		const names = new Set<string>();
		for (const l of locations) { for (const r of l.regions ?? []) { names.add(r); } }
		if (region?.fallbackGroup) { names.add(region.fallbackGroup); }
		return [...names].sort();
	}, [locations, region]);
	const regionsByDatacenter = useMemo(() => new Map(locations.map((l) => [l.location, l.regions ?? []])), [locations]);

	const form = useForm<OrganizationRegionFormValues>({
		resolver: zodResolver(OrganizationRegionFormSchema),
		defaultValues: toFormValues(region),
	});

	useEffect(() => {
		if (open) { form.reset(toFormValues(region)); }
	}, [open, region, form]);

	const linodeDatacenters = form.watch('linodeDatacenters');
	const gcpDatacenters = form.watch('gcpDatacenters');

	const onSubmit = (values: OrganizationRegionFormValues) => {
		// Mirrors central-manager's rule that a fallback pool covers every listed datacenter, as an early
		// form error only: skipped while the Location catalog is absent, and when the shape and pool are
		// not being written, so neither a pending catalog nor an `active` toggle gets refused here.
		const patch = region ? toPatch(region, values) : null;
		const placementWritten = !patch || patch.placement !== undefined || patch.fallbackGroup !== undefined;
		if (placementWritten && organization && values[providerField].length === 0) {
			form.setError(providerField, {
				message:
					`${organization.name} deploys on ${providerLabel}; a region with no ${providerLabel} datacenters places nothing.`,
			});
			return;
		}
		if (placementWritten && locations.length && values.fallbackGroup !== NO_FALLBACK) {
			const outside = [...values.linodeDatacenters, ...values.gcpDatacenters].find((dc) =>
				!regionsByDatacenter.get(dc)?.includes(values.fallbackGroup)
			);
			if (outside) {
				form.setError('fallbackGroup', { message: `${outside} is not in region ${values.fallbackGroup}` });
				return;
			}
		}

		const onSuccess = (saved: OrganizationRegion) => {
			toast.success(isEdit ? 'Custom region updated' : 'Custom region created');
			void queryClient.invalidateQueries({ queryKey: organizationRegionsQueryKey(organizationId) });
			if (region) {
				void queryClient.invalidateQueries({ queryKey: organizationRegionQueryKey(region.id) });
			}
			onOpenChange(false);
			onSaved?.(saved);
		};
		const onError = (error: unknown) => {
			const message = describeApiError(error);
			const status = isAxiosError(error) ? error.response?.status : undefined;
			// 409 is either the name collision or the freeze; both belong on the form, not a toast.
			form.setError(status === 409 && !frozen ? 'name' : 'root', { message });
		};

		if (region) {
			const changes = toPatch(region, values);
			if (Object.keys(changes).length === 0) {
				onOpenChange(false);
				return;
			}
			updateRegion({ id: region.id, changes }, { onSuccess, onError });
		} else {
			createRegion(toCreatePayload(organizationId, values), { onSuccess, onError });
		}
	};

	const isFrozen = (field: (typeof FROZEN_WHILE_REFERENCED)[number]) =>
		frozen && FROZEN_WHILE_REFERENCED.includes(field);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl">
				<DialogTitle>{isEdit ? 'Edit custom region' : 'Create custom region'}</DialogTitle>
				<DialogDescription>
					{isEdit
						? 'Update this custom region.'
						: 'Define the datacenters one unit of this region occupies. A cluster chooses how many units it wants.'}
				</DialogDescription>
				{frozen && (
					<p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground" role="note">
						Deployed by {referencingClusters.map((c) =>
							`${c.name} (×${c.quantity})`
						).join(', ')}. The name, datacenters and fallback are fixed while a cluster runs on this region; create a
						new region to change them.
					</p>
				)}
				<Form {...form}>
					<form className="my-4 flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1">Name</FormLabel>
									<FormControl>
										<Input placeholder="e.g. Paris + Milan" {...field} disabled={isFrozen('name')} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 items-start">
							<FormField
								control={form.control}
								name="linodeDatacenters"
								render={({ field }) => (
									<FormItem className={provider === 'linode' ? 'order-first' : undefined}>
										<FormLabel className="pb-1">
											Linode datacenters{provider === 'linode' && ' — this organization deploys here'}
										</FormLabel>
										<FormControl>
											<MultiSelect
												options={linodeOptions}
												selected={field.value}
												onChange={field.onChange}
												placeholder="None"
												emptyText="No Linode locations"
												ariaLabel="Linode datacenters"
												allowRepeats
												disabled={isFrozen('linodeDatacenters')}
											/>
										</FormControl>
										<DatacenterCountSummary datacenters={linodeDatacenters} ariaLabel="Linode instances per unit" />
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="gcpDatacenters"
								render={({ field }) => (
									<FormItem className={provider === 'gcp' ? 'order-first' : undefined}>
										<FormLabel className="pb-1">
											GCP datacenters{provider === 'gcp' && ' — this organization deploys here'}
										</FormLabel>
										<FormControl>
											<MultiSelect
												options={gcpOptions}
												selected={field.value}
												onChange={field.onChange}
												placeholder="None"
												emptyText="No GCP locations"
												ariaLabel="GCP datacenters"
												allowRepeats
												disabled={isFrozen('gcpDatacenters')}
											/>
										</FormControl>
										<DatacenterCountSummary datacenters={gcpDatacenters} ariaLabel="GCP instances per unit" />
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<p className="text-xs text-muted-foreground -mt-2">
							Pick a datacenter again to place another instance there. {organization
								? `${organization.name} deploys on ${providerLabel}, so only that list places instances; the other is kept for a provider change.`
								: "The organization's cloud provider decides which list is used."}
						</p>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 items-start">
							<FormField
								control={form.control}
								name="fallbackGroup"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="pb-1">Fallback pool</FormLabel>
										<FormControl>
											<Select
												value={field.value === NO_FALLBACK ? FORCED_OPTION : field.value}
												onValueChange={(value) => field.onChange(value === FORCED_OPTION ? NO_FALLBACK : value)}
												disabled={isFrozen('fallbackGroup')}
											>
												<SelectTrigger className="w-full" aria-label="Fallback pool">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value={FORCED_OPTION}>None — forced placement</SelectItem>
													{fallbackOptions.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
												</SelectContent>
											</Select>
										</FormControl>
										<p className="text-xs text-muted-foreground">
											Without a pool, a datacenter with no capacity fails the deploy instead of landing elsewhere.
										</p>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<FormField
							control={form.control}
							name="active"
							render={({ field }) => (
								<FormItem>
									<div className="flex items-center gap-2">
										<FormControl>
											<input
												type="checkbox"
												className="size-4"
												checked={field.value}
												onChange={(e) => field.onChange(e.target.checked)}
											/>
										</FormControl>
										<FormLabel className="!pb-0">Active</FormLabel>
									</div>
									<p className="text-xs text-muted-foreground">
										An inactive region stays on the clusters that use it but isn't offered for new deployments.
									</p>
									<FormMessage />
								</FormItem>
							)}
						/>
						{form.formState.errors.root && (
							<p className="text-sm text-destructive" role="alert">{form.formState.errors.root.message}</p>
						)}
						<DialogFooter>
							<div className="flex w-full justify-between">
								<Button
									variant="destructiveOutline"
									type="button"
									onClick={() => onOpenChange(false)}
									disabled={isPending}
								>
									Cancel
								</Button>
								<Button variant="submit" disabled={isPending}>
									{isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create custom region'}
								</Button>
							</div>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
