import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { UpsertClusterSchemaType } from '@/features/clusters/upsert/upsertClusterSchema';
import { SchemaCloudInstanceTypes, SchemaPlan, SchemaRegion } from '@/integrations/api/api.gen';
import { sortByNumberPrefix } from '@/lib/arrays/sort/byNumberPrefix';
import { pluralize } from '@/lib/pluralize';
import { MapPinIcon, TrashIcon } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { Control, UseFieldArrayReturn, UseFormReturn } from 'react-hook-form';
import { PremiumOnlyRegions } from '../lib/calculatePremiumOnlyRegions';
import { UsageScale } from '../lib/calculateUsageScale';
import {
	describeShape,
	isOrganizationRegionId,
	MAX_REGION_PLAN_QUANTITY,
	regionAtQuantity,
	RegionLookup,
} from '../lib/regionLookup';
import { ResourcesPerInstance } from './ResourcesPerInstance';

type RegionFormInputsProps = {
	control: Control<UpsertClusterSchemaType>;
	fieldArray: UseFieldArrayReturn<UpsertClusterSchemaType, 'regionPlans'>;
	form: UseFormReturn<UpsertClusterSchemaType>;
	index: number;
	regionLookup: RegionLookup;
	regionNameToLatencyToRegion: Record<string, Record<string, SchemaRegion>>;
	premiumOnlyRegions: PremiumOnlyRegions;
	usageScale: UsageScale;
	selectedPlan: SchemaPlan | undefined;
	isEnterprise: boolean;
	cloudProvider: keyof SchemaCloudInstanceTypes | undefined;
	organizationId: string;
	canUseCustomRegions: boolean;
	lockedOrganizationRegionIds: string[];
	/** Every row's region id, this row's included; a custom region already on another row cannot be picked twice. */
	selectedRegionIds: string[];
};

function pickLatencyDescription(options: readonly string[], preferred: string | undefined): string | undefined {
	const tier = preferred?.split(' ')[0].toLowerCase();
	return options.find(description => !tier ? true : description.split(' ')[0].toLowerCase() === tier) || options[0];
}

// The form stores a region id; the name and latency selects are a view over the catalog for it.
export function RegionFormInputs({
	control,
	fieldArray,
	form,
	index,
	regionLookup,
	regionNameToLatencyToRegion,
	premiumOnlyRegions,
	usageScale,
	selectedPlan,
	isEnterprise,
	cloudProvider,
	canUseCustomRegions,
	lockedOrganizationRegionIds,
	selectedRegionIds,
}: RegionFormInputsProps) {
	const availableRegionNames = useMemo(() => Object.keys(regionNameToLatencyToRegion).sort(), [
		regionNameToLatencyToRegion,
	]);
	const isDedicated = form.watch('deploymentDescription')?.startsWith('Dedicated');
	const entryRegionId = form.watch(`regionPlans.${index}.regionId`);
	const entryQuantity = form.watch(`regionPlans.${index}.quantity`);
	const resolved = regionLookup.get(entryRegionId);
	const catalogSelection = resolved?.kind === 'catalog' ? resolved : undefined;
	const organizationSelection = resolved?.kind === 'organization' ? resolved : undefined;
	const selectedRegionName = catalogSelection?.name ?? '';
	const selectedLatencyDescription = catalogSelection?.latencyDescription ?? '';
	const availableLatencyDescriptions = useMemo(
		() => Object.keys(regionNameToLatencyToRegion[selectedRegionName] || {}).sort(sortByNumberPrefix).reverse(),
		[regionNameToLatencyToRegion, selectedRegionName],
	);
	const organizationRegions = useMemo(
		() =>
			[...regionLookup.values()].filter(region =>
				region.kind === 'organization'
				&& ((region.active && region.instanceCount > 0) || region.id === entryRegionId)
			),
		[entryRegionId, regionLookup],
	);
	const showCustomGroup = canUseCustomRegions ? organizationRegions.length > 0 : !!organizationSelection;
	// A member keeps a custom region staff placed, but cannot swap it for anything else.
	// Locked only when the server's plans carry it: a retried failed cluster carries the row as a draft,
	// which a member must be able to swap out.
	const lockedToOrganizationRegion = !!organizationSelection && !canUseCustomRegions
		&& lockedOrganizationRegionIds.includes(organizationSelection.id);

	const allowedRegionIds = selectedPlan?.allowedRegionIds;
	const isRegionAllowedByPlan = useCallback(
		(regionName: string) =>
			!allowedRegionIds?.length
			|| Object.values(regionNameToLatencyToRegion[regionName] || {}).some(region =>
				allowedRegionIds.includes(region.id)
			),
		[allowedRegionIds, regionNameToLatencyToRegion],
	);
	const isLatencyAllowedByPlan = useCallback(
		(latencyDescription: string) => {
			if (!allowedRegionIds?.length) {
				return true;
			}
			const id = regionNameToLatencyToRegion[selectedRegionName]?.[latencyDescription]?.id;
			return !id || allowedRegionIds.includes(id);
		},
		[allowedRegionIds, regionNameToLatencyToRegion, selectedRegionName],
	);

	const setEntry = useCallback((regionId: string, quantity: number | undefined) => {
		form.setValue(`regionPlans.${index}.regionId`, regionId, { shouldDirty: true });
		form.setValue(`regionPlans.${index}.quantity`, quantity, { shouldDirty: true });
		void form.trigger();
	}, [form, index]);

	const onRegionValueChange = useCallback((value: string) => {
		if (isOrganizationRegionId(value)) {
			setEntry(value, entryQuantity ?? 1);
			return;
		}
		const latencyOptions = Object.keys(regionNameToLatencyToRegion[value] || {}).sort(sortByNumberPrefix).reverse();
		const latency = pickLatencyDescription(latencyOptions, selectedLatencyDescription);
		setEntry((latency && regionNameToLatencyToRegion[value]?.[latency]?.id) || '', undefined);
	}, [entryQuantity, regionNameToLatencyToRegion, selectedLatencyDescription, setEntry]);

	const onLatencyValueChange = useCallback((value: string) => {
		const region = regionNameToLatencyToRegion[selectedRegionName]?.[value];
		if (region) {
			setEntry(region.id, undefined);
		}
	}, [regionNameToLatencyToRegion, selectedRegionName, setEntry]);

	const onRemoveClicked = useCallback(() => {
		fieldArray?.remove(index);
		void form.trigger();
	}, [fieldArray, form, index]);

	const resourcesRegion = useMemo(() => resolved ? regionAtQuantity(resolved, entryQuantity) : undefined, [
		entryQuantity,
		resolved,
	]);

	return (
		<div className="md:col-span-6 col-span-3 py-2 pl-4 border-l-4 border-border gap-6 flex flex-wrap items-start">
			<FormField
				control={control}
				name={`regionPlans.${index}.regionId`}
				render={() => (
					<FormItem className="min-w-0 basis-full sm:flex-1">
						<FormLabel className="flex items-center gap-1.5">
							<MapPinIcon className="size-4 shrink-0" />
							Region {fieldArray.fields.length > 1 ? index + 1 : ''}
						</FormLabel>
						<FormControl>
							<Select
								value={organizationSelection?.id ?? selectedRegionName}
								onValueChange={onRegionValueChange}
								disabled={lockedToOrganizationRegion}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Choose Region" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{showCustomGroup && <SelectLabel>Regions</SelectLabel>}
										{availableRegionNames.map((regionName) => (
											<SelectItem key={regionName} value={regionName} disabled={!isRegionAllowedByPlan(regionName)}>
												<span className="flex items-center gap-2">
													{regionName}
													{premiumOnlyRegions.regionNames.has(regionName) && <Badge>Premium</Badge>}
												</span>
											</SelectItem>
										))}
									</SelectGroup>
									{showCustomGroup && (
										<SelectGroup>
											<SelectLabel>Custom regions</SelectLabel>
											{organizationRegions.map((region) => {
												const onAnotherRow = region.id !== entryRegionId && selectedRegionIds.includes(region.id);
												return (
													<SelectItem key={region.id} value={region.id} disabled={onAnotherRow}>
														<span className="flex items-center gap-2">
															{region.name}
															<Badge variant="secondary">Custom</Badge>
															{!region.active && <Badge variant="secondary">Inactive</Badge>}
															{onAnotherRow && (
																<span className="text-xs text-muted-foreground">
																	already on this cluster — change its units
																</span>
															)}
														</span>
													</SelectItem>
												);
											})}
										</SelectGroup>
									)}
								</SelectContent>
							</Select>
						</FormControl>
						<FormMessage />
					</FormItem>
				)}
			/>

			{organizationSelection
				? (
					<>
						<div className="min-w-0 basis-full sm:flex-1 space-y-2">
							<FormLabel>Datacenters per unit</FormLabel>
							<p className="font-mono text-sm leading-9">
								{organizationSelection.shape.length
									? describeShape(organizationSelection.shape)
									: 'No datacenters on this provider'}
							</p>
						</div>
						<FormField
							control={control}
							name={`regionPlans.${index}.quantity`}
							render={({ field }) => (
								<FormItem className="w-28">
									<FormLabel>Units</FormLabel>
									<FormControl>
										<Input
											type="number"
											inputMode="numeric"
											min={1}
											max={MAX_REGION_PLAN_QUANTITY}
											step={1}
											value={field.value ?? ''}
											onChange={event => {
												const raw = event.target.value;
												field.onChange(raw === '' ? undefined : Number(raw));
												void form.trigger();
											}}
											onBlur={field.onBlur}
											name={field.name}
											ref={field.ref}
											disabled={!canUseCustomRegions}
										/>
									</FormControl>
									<p className="text-xs text-muted-foreground">
										{pluralize(organizationSelection.instanceCount * (entryQuantity ?? 1), 'instance', 'instances')}
									</p>
									<FormMessage />
								</FormItem>
							)}
						/>
					</>
				)
				: (
					<div className="min-w-0 basis-full sm:flex-1 space-y-2">
						<FormLabel>Estimated {isDedicated ? 'P95' : 'P90'} Latency, Distribution</FormLabel>
						<Select
							value={selectedLatencyDescription}
							onValueChange={onLatencyValueChange}
							disabled={!availableLatencyDescriptions?.length}
						>
							<SelectTrigger className="w-full">
								<SelectValue placeholder="Choose Latency Tier" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{availableLatencyDescriptions.map((latencyDescription) => (
										<SelectItem
											key={latencyDescription}
											value={latencyDescription}
											disabled={!isLatencyAllowedByPlan(latencyDescription)}
										>
											<span className="flex items-center gap-2">
												{latencyDescription}
												{(() => {
													const id = regionNameToLatencyToRegion[selectedRegionName]?.[latencyDescription]?.id;
													return id && premiumOnlyRegions.regionIds.has(id) && <Badge>Premium</Badge>;
												})()}
											</span>
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>
				)}

			{fieldArray?.fields?.length && fieldArray?.fields?.length > 1 && !lockedToOrganizationRegion && (
				<div className="flex-none mt-6">
					<Button
						type="button"
						variant="destructiveOutline"
						size="sm"
						onClick={onRemoveClicked}
					>
						<TrashIcon /> <span className="sr-only">Remove</span>
					</Button>
				</div>
			)}
			<ResourcesPerInstance
				selectedPlan={selectedPlan}
				selectedRegion={resourcesRegion}
				usageScale={usageScale}
				isEnterprise={isEnterprise}
				cloudProvider={cloudProvider}
			/>
		</div>
	);
}
