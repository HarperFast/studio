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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MultiSelect, MultiSelectOption } from '@/features/admin/regions/components/MultiSelect';
import { useCreateRegionMutation } from '@/features/admin/regions/mutations/useCreateRegion';
import { useUpdateRegionMutation } from '@/features/admin/regions/mutations/useUpdateRegion';
import { getLocationsQueryOptions } from '@/features/admin/regions/queries/getLocations';
import { formatOrgLabel, getOrganizationsQueryOptions } from '@/features/admin/regions/queries/getOrganizations';
import { getRegionsQueryOptions, regionsQueryKey } from '@/features/admin/regions/queries/getRegions';
import { RegionFormSchema, RegionFormValues } from '@/features/admin/regions/RegionFormSchema';
import { AdminRegion } from '@/integrations/api/api.patch';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { InfoIcon } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

/** Menu items rendered at once for the org picker; the filter reaches the rest. */
const ORGANIZATION_OPTIONS_RENDERED = 100;

interface RegionFormModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** The region being edited; omit/null to create a new one. */
	region?: AdminRegion | null;
}

function toFormValues(region?: AdminRegion | null): RegionFormValues {
	return {
		id: region?.id ?? '',
		region: region?.region ?? '',
		instanceCount: region?.instanceCount ?? 1,
		purchasedBlockMultiplier: region?.purchasedBlockMultiplier ?? 1,
		latencyDescription: region?.latencyDescription ?? '',
		linodePreferredLocations: region?.linodePreferredLocations ?? [],
		gcpPreferredLocations: region?.gcpPreferredLocations ?? [],
		forceLocations: region?.forceLocations ?? false,
		active: region?.active ?? true,
		organizationIds: region?.organizationIds ?? [],
	};
}

export function RegionFormModal({ open, onOpenChange, region }: RegionFormModalProps) {
	const isEdit = !!region;
	const queryClient = useQueryClient();

	const { data: locations = [] } = useQuery({ ...getLocationsQueryOptions(), enabled: open });
	const { data: orgResult } = useQuery({ ...getOrganizationsQueryOptions(), enabled: open });
	const organizations = orgResult?.organizations ?? [];
	const { data: regions = [] } = useQuery({ ...getRegionsQueryOptions(), enabled: open });

	const { mutate: createRegion, isPending: isCreating } = useCreateRegionMutation();
	const { mutate: updateRegion, isPending: isUpdating } = useUpdateRegionMutation();
	const isPending = isCreating || isUpdating;

	// Location labels carry the provider code (e.g. "Chennai, India (in-maa)") since that code is
	// what's actually stored and what admins recognize.
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
	const orgOptions = useMemo<MultiSelectOption[]>(
		() => organizations.map((o) => ({ value: o.id, label: formatOrgLabel(o.id, o.name) })),
		[organizations],
	);
	// A region's Name must be one of the known region groupings (the union of every location's
	// `regions`); a colocated region named for a grouping no location serves would have no hosts.
	// Keep an editing region's current name selectable even if it predates this rule.
	const regionNameOptions = useMemo<string[]>(() => {
		const names = new Set<string>();
		for (const l of locations) { for (const r of l.regions ?? []) { names.add(r); } }
		if (region?.region) { names.add(region.region); }
		return [...names].sort();
	}, [locations, region]);

	const form = useForm<RegionFormValues>({
		resolver: zodResolver(RegionFormSchema),
		defaultValues: toFormValues(region),
	});

	// Reset to the target region whenever the modal (re)opens or switches which region it edits.
	useEffect(() => {
		if (open) { form.reset(toFormValues(region)); }
	}, [open, region, form]);

	const onSubmit = (values: RegionFormValues) => {
		// Regions intentionally share a name (e.g. several "Global" tiers), so the latency description
		// is the differentiator and must be unique. Only check when it actually changes: the seeded
		// catalog already ships a collision (us-ne-1 / us-se-1 both use "49ms, small distribution"),
		// and this form submits every field — validating an unchanged value would make those rows
		// uneditable. Mirrors RegionAdmin's server-side check, which is the source of truth (409).
		const norm = (s: string) => s.trim().toLowerCase();
		const latencyChanged = !region || norm(region.latencyDescription) !== norm(values.latencyDescription);
		const others = regions.filter((r) => r.id !== region?.id);
		if (latencyChanged && others.some((r) => norm(r.latencyDescription) === norm(values.latencyDescription))) {
			form.setError('latencyDescription', { message: 'A region with this latency description already exists' });
			return;
		}

		const organizationIds = values.organizationIds.length > 0 ? values.organizationIds : null;

		const onSuccess = () => {
			toast.success(isEdit ? 'Region updated' : 'Region created');
			void queryClient.invalidateQueries({ queryKey: regionsQueryKey });
			onOpenChange(false);
		};

		// Narrow on `region` itself rather than the `isEdit` alias — equivalent today, but it doesn't
		// depend on TS's aliased-condition inference surviving a refactor of `isEdit`.
		if (region) {
			const { id: _id, ...changes } = values;
			updateRegion({ id: region.id, changes: { ...changes, organizationIds } }, { onSuccess });
		} else {
			createRegion({ ...values, organizationIds }, { onSuccess });
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl">
				<DialogTitle>{isEdit ? 'Edit region' : 'Create region'}</DialogTitle>
				<DialogDescription>
					{isEdit
						? 'Update this region. Its ID is fixed once created.'
						: 'Define a new deployment region. Leave organizations empty to make it public (all organizations).'}
				</DialogDescription>
				<Form {...form}>
					<form className="my-4 flex flex-col gap-4" onSubmit={form.handleSubmit(onSubmit)}>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 items-start">
							<FormField
								control={form.control}
								name="id"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="pb-1">Region ID</FormLabel>
										<FormControl>
											<Input placeholder="e.g. us-east-1" {...field} disabled={isEdit} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="region"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="pb-1">Region</FormLabel>
										<FormControl>
											<Select value={field.value} onValueChange={field.onChange}>
												<SelectTrigger className="w-full">
													<SelectValue placeholder="Select a region" />
												</SelectTrigger>
												<SelectContent>
													{regionNameOptions.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
												</SelectContent>
											</Select>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="instanceCount"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="pb-1">Instance count</FormLabel>
										<FormControl>
											<Input
												type="number"
												min={1}
												step={1}
												name={field.name}
												ref={field.ref}
												onBlur={field.onBlur}
												value={Number.isFinite(field.value) ? field.value : ''}
												onChange={(e) => field.onChange(e.target.valueAsNumber)}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="purchasedBlockMultiplier"
								render={({ field }) => (
									<FormItem>
										<div className="flex items-center gap-1.5 pb-1">
											<FormLabel className="!pb-0">Purchased block multiplier</FormLabel>
											<Tooltip>
												<TooltipTrigger asChild>
													<button
														type="button"
														aria-label="What is the purchased block multiplier?"
														className="text-muted-foreground hover:text-foreground"
													>
														<InfoIcon className="size-3.5" />
													</button>
												</TooltipTrigger>
												<TooltipContent className="max-w-xs">
													How many purchased blocks a cluster in this region is billed for. One block covers a baseline
													cluster: a 2-node cluster is 1 block and a 4-node cluster is 2 blocks. Each block carries one
													license against the selected plan's limits; once they're all used up, this many are issued and
													billed again.
												</TooltipContent>
											</Tooltip>
										</div>
										<FormControl>
											<Input
												type="number"
												min={1}
												step={1}
												name={field.name}
												ref={field.ref}
												onBlur={field.onBlur}
												value={Number.isFinite(field.value) ? field.value : ''}
												onChange={(e) => field.onChange(e.target.valueAsNumber)}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<FormField
							control={form.control}
							name="latencyDescription"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1">Latency description</FormLabel>
									<FormControl>
										<Input placeholder="e.g. 280ms, medium distribution" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 items-start">
							<FormField
								control={form.control}
								name="linodePreferredLocations"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="pb-1">Linode preferred locations</FormLabel>
										<FormControl>
											<MultiSelect
												options={linodeOptions}
												selected={field.value}
												onChange={field.onChange}
												placeholder="Any Linode location"
												emptyText="No Linode locations"
												ariaLabel="Linode preferred locations"
												allowRepeats
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="gcpPreferredLocations"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="pb-1">GCP preferred locations</FormLabel>
										<FormControl>
											<MultiSelect
												options={gcpOptions}
												selected={field.value}
												onChange={field.onChange}
												placeholder="Any GCP location"
												emptyText="No GCP locations"
												ariaLabel="GCP preferred locations"
												allowRepeats
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<FormField
							control={form.control}
							name="forceLocations"
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
										<FormLabel className="!pb-0">Force locations</FormLabel>
									</div>
									<p className="text-xs text-muted-foreground">
										Pin deployments to the preferred locations above instead of treating them as hints.
									</p>
									<FormMessage />
								</FormItem>
							)}
						/>
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
										Inactive regions stay available to existing deployments but aren't offered for new ones.
									</p>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="organizationIds"
							render={({ field }) => (
								<FormItem>
									<FormLabel className="pb-1">Organizations (customer scope)</FormLabel>
									<FormControl>
										<MultiSelect
											options={orgOptions}
											selected={field.value}
											onChange={field.onChange}
											placeholder="Public — all organizations"
											emptyText="No organizations"
											ariaLabel="Organizations"
											maxVisibleOptions={ORGANIZATION_OPTIONS_RENDERED}
										/>
									</FormControl>
									{orgResult?.truncated && (
										<p className="text-xs text-destructive">
											Too many organizations to list them all — some may be missing from this picker.
										</p>
									)}
									<FormMessage />
								</FormItem>
							)}
						/>
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
									{isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create region'}
								</Button>
							</div>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
