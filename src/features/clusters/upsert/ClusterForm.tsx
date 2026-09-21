import { EstimatedProgressBar } from '@/components/EstimatedProgressBar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Form } from '@/components/ui/form/Form';
import { isFailed } from '@/components/ui/utils/badgeStatus';
import { defaultOperationsApiPort } from '@/config/constants';
import { useCreateNewClusterMutation } from '@/features/clusters/hooks/useCreateNewCluster';
import { useEditClusterMutation } from '@/features/clusters/hooks/useUpdateCluster';
import { terminateCluster } from '@/features/clusters/mutations/terminateCluster';
import { HarperVersionsResponse } from '@/features/clusters/queries/getHarperVersionsQuery';
import { plansFromShape, prefillFromGrant } from '@/features/clusters/upsert/lib/grantPrefill';
import { needsBillingStep } from '@/features/clusters/upsert/lib/needsBillingStep';
import { getOrganization } from '@/features/organization/queries/getOrganizationQuery';
import { SchemaPlan, SchemaRegion, SchemaRegionPlan } from '@/integrations/api/api.gen';
import { Organization } from '@/integrations/api/api.patch';
import { isUnrestrictedOrgType } from '@/integrations/api/orgType';
import { sortByField } from '@/lib/arrays/sort/byField';
import { groupThenKeyBy } from '@/lib/groupThenKeyBy';
import { pluralize } from '@/lib/pluralize';
import { collapseKebabsToMaxLength } from '@/lib/string/collapseKebabsToMaxLength';
import { stringsShareAPrefix } from '@/lib/string/stringsShareAPrefix';
import { toKebabCase } from '@/lib/string/to-kebab-case';
import { isPositive } from '@/lib/types/isPositive';
import { invalidateEntityQueries } from '@/react-query/invalidateEntityQueries';
import { describeError } from '@/react-query/queryClient';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { CreditCard, Server } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ClusterBilling } from './ClusterBilling';
import { ClusterDetails } from './ClusterDetails';
import { calculateInstanceFQDN } from './lib/calculateInstanceFQDN';
import { describeRegionSwap, RegionCohort } from './lib/describeRegionSwap';
import { PartialUpgrade } from './lib/detectPartialUpgrade';
import { pickDefaultDeploymentPerformanceAndRegionPlans } from './lib/pickDefaultDeploymentPerformanceAndRegionPlans';
import { buildRegionLookup, isOrganizationRegionId, MIN_CLUSTER_INSTANCES, regionCohortKey } from './lib/regionLookup';
import { PriceDisplay } from './PriceDisplay';
import { specifiedAbbreviatedName, UpsertClusterSchema, UpsertClusterSchemaType } from './upsertClusterSchema';

interface ClusterFormProps {
	alreadyUsingFree: boolean;
	clusterId?: string;
	/** The regions the cluster being edited runs in now, as central manager matches them; empty when creating. */
	currentRegions: readonly RegionCohort[];
	defaultValues: UpsertClusterSchemaType;
	deploymentToPerformanceToPlan: Record<string, Record<string, SchemaPlan>>;
	harperVersions: HarperVersionsResponse | undefined;
	mode: 'version' | undefined;
	organization: Organization;
	organizationId: string;
	organizationRegions: OrganizationRegion[];
	/** Staff may place the organization's custom regions and set their quantity. */
	canUseCustomRegions: boolean;
	canDefineCustomRegions: boolean;
	/** Custom regions the server already has on this cluster; a member keeps these but adds none. */
	lockedOrganizationRegionIds: string[];
	partialUpgrade: PartialUpgrade | null;
	planTypes: SchemaPlan[];
	regionLocationsColocated: SchemaRegion[];
	regionLocationsDedicated: SchemaRegion[];
	/** The cluster's current plan freezes its region set (see central-manager's plan.js). */
	regionSetFrozen?: boolean;
	/** What the cluster runs today — kept selectable even when its tier is otherwise not offered. */
	currentPlanId?: string;
	setSavedClusterState: (value: null | ({ clusterId?: string } & UpsertClusterSchemaType)) => void;
	startOffOnBilling: boolean;
}

export function ClusterForm({
	alreadyUsingFree,
	clusterId,
	currentRegions,
	defaultValues,
	deploymentToPerformanceToPlan,
	harperVersions,
	mode,
	organization,
	organizationId,
	organizationRegions,
	canUseCustomRegions,
	canDefineCustomRegions,
	lockedOrganizationRegionIds,
	partialUpgrade,
	planTypes,
	regionLocationsColocated,
	regionLocationsDedicated,
	regionSetFrozen,
	currentPlanId,
	setSavedClusterState,
	startOffOnBilling,
}: ClusterFormProps) {
	const navigate = useNavigate();
	const router = useRouter();
	const isEnterprise = isUnrestrictedOrgType(organization?.type);
	const cloudProvider = organization?.channel === 'Akamai' ? 'linode' : undefined;

	const queryClient = useQueryClient();
	const { mutate: submitNewClusterData, isPending: isCreatePending } = useCreateNewClusterMutation();
	const { mutate: submitEditClusterData, isPending: isEditPending, error: editError } = useEditClusterMutation();
	const editFailure = editError ? describeError(editError).message : undefined;
	// The button disables on isPending, but that flips a tick after the click; a second submit in
	// that tick would send the same create or plan change twice, and the server admits both.
	const submitInFlight = useRef(false);

	const [confirmingPaymentDetails, setConfirmingPaymentDetails] = useState(startOffOnBilling);

	const colocatedRegionNameToLatencyToRegion = useMemo<Record<string, Record<string, SchemaRegion>>>(
		() =>
			groupThenKeyBy(
				regionLocationsColocated?.sort(sortByField('latencyDescription')) || [],
				'region',
				'latencyDescription',
			),
		[regionLocationsColocated],
	);
	const dedicatedRegionNameToLatencyToRegion = useMemo<Record<string, Record<string, SchemaRegion>>>(
		() =>
			groupThenKeyBy(
				regionLocationsDedicated?.sort(sortByField('latencyDescription')) || [],
				'region',
				'latencyDescription',
			),
		[regionLocationsDedicated],
	);
	const colocatedRegionLookup = useMemo(
		() => buildRegionLookup(regionLocationsColocated, organizationRegions, cloudProvider),
		[cloudProvider, organizationRegions, regionLocationsColocated],
	);
	const dedicatedRegionLookup = useMemo(
		() => buildRegionLookup(regionLocationsDedicated, organizationRegions, cloudProvider),
		[cloudProvider, organizationRegions, regionLocationsDedicated],
	);
	const preexistingOrganizationRegionIds = useMemo(() => new Set(lockedOrganizationRegionIds), [
		lockedOrganizationRegionIds,
	]);

	const refineZod = useCallback((data: UpsertClusterSchemaType, ctx: z.RefinementCtx) => {
		const names = new Set();
		const selectedPlan = deploymentToPerformanceToPlan?.[data.deploymentDescription]?.[data.performanceDescription];
		const isSelfManaged = data.deploymentDescription === 'Self-Hosted';
		// A version edit submits neither regions nor instances, so a stale draft cannot block it.
		if (mode === 'version') {
			return;
		}
		if (isSelfManaged) {
			for (let i = 0; i < data.instances.length; i++) {
				const fqdn = calculateInstanceFQDN(data.instances[i]);
				if (!names.has(fqdn)) {
					names.add(fqdn);
				} else {
					ctx.addIssue({
						code: 'custom',
						path: [`instances.${i}.fqdn`],
						message: 'Every instance url must be unique!',
					});
				}
			}
		} else {
			if (selectedPlan?.priceUsd === 0 && alreadyUsingFree) {
				ctx.addIssue({
					code: 'custom',
					path: [`performanceDescription`],
					message: 'Only one free cluster is allowed per organization.',
				});
			}
			const regionLookup = selectedPlan?.deploymentDescription !== 'Dedicated'
				? colocatedRegionLookup
				: dedicatedRegionLookup;
			let totalInstances = 0;
			let firstOrganizationRegionIndex = -1;
			const selectedRegions: RegionCohort[] = [];
			for (let i = 0; i < data.regionPlans.length; i++) {
				const regionPlan = data.regionPlans[i];
				const region = regionNameToLatencyToRegion[regionPlan.regionName]?.[regionPlan.latencyDescription];
				// A region that no longer resolves has to fail validation. The base schema only requires
				// non-empty strings, so a cluster sitting in a region that has dropped out of the live
				// list — deactivated, out of capacity, or org-scoped away — used to be caught by an
				// effect blanking the value. A frozen region set must not be rewritten, so the objection
				// belongs here instead: without it submit stays enabled and the click throws.
				if (!region) {
					ctx.addIssue({
						code: 'custom',
						path: [`regionPlans.${i}.regionName`],
						message: 'This region is not currently available. Contact us to move this cluster.',
					});
				}
				if (!names.has(regionPlan.regionName)) {
					names.add(regionPlan.regionName);
				} else {
					ctx.addIssue({
						code: 'custom',
						path: [`regionPlans.${i}.regionId`],
						message: 'You can only select a region once!',
					});
				}
				if (region.kind === 'organization') {
					if (firstOrganizationRegionIndex < 0) {
						firstOrganizationRegionIndex = i;
					}
					if (region.instanceCount === 0) {
						ctx.addIssue({
							code: 'custom',
							path: [`regionPlans.${i}.regionId`],
							message: "This custom region has no datacenters on the organization's cloud provider.",
						});
					}
					if (!canUseCustomRegions && !preexistingOrganizationRegionIds.has(region.id)) {
						ctx.addIssue({
							code: 'custom',
							path: [`regionPlans.${i}.regionId`],
							message: 'Custom regions can only be placed by Harper staff.',
						});
					}
					if (!regionPlan.quantity) {
						ctx.addIssue({
							code: 'custom',
							path: [`regionPlans.${i}.quantity`],
							message: 'Please choose how many units to deploy.',
						});
					}
					totalInstances += region.instanceCount * (regionPlan.quantity ?? 1);
					// Plan region restrictions describe the catalog; central-manager decides custom regions.
					continue;
				}
				totalInstances += region.instanceCount;
				if (selectedPlan?.allowedRegionIds?.length) {
					if (!selectedPlan.allowedRegionIds.includes(region.id)) {
						const prefixMatches = stringsShareAPrefix(selectedPlan.allowedRegionIds, region.id);
						ctx.addIssue({
							code: 'custom',
							path: [`regionPlans.${i}.regionId`],
							message: prefixMatches
								? `This latency is not available with the selected performance tier!`
								: `This region is not available with the selected performance tier!`,
						});
					} else if (i >= 1) {
						ctx.addIssue({
							code: 'custom',
							path: [`regionPlans.${i}.regionId`],
							message: `You can only select one region with this performance tier!`,
						});
					}
				}
			}
			if (firstOrganizationRegionIndex >= 0 && totalInstances < MIN_CLUSTER_INSTANCES) {
				ctx.addIssue({
					code: 'custom',
					path: [`regionPlans.${firstOrganizationRegionIndex}.quantity`],
					message: `A cluster needs at least ${MIN_CLUSTER_INSTANCES} instances in total.`,
				});
			}
			const regionSwap = describeRegionSwap({
				currentRegions,
				selectedRegions,
				singleRegionTier: !selectedPlan?.priceUsd || !!selectedPlan.allowedRegionIds?.length,
			});
			if (regionSwap) {
				ctx.addIssue({ code: 'custom', path: ['regionPlans.0.regionId'], message: regionSwap });
			}
		}
	}, [
		alreadyUsingFree,
		canUseCustomRegions,
		colocatedRegionLookup,
		currentRegions,
		dedicatedRegionLookup,
		deploymentToPerformanceToPlan,
		mode,
		preexistingOrganizationRegionIds,
	]);

	const form = useForm({
		mode: 'onChange',
		resolver: zodResolver(UpsertClusterSchema.superRefine(refineZod)),
		defaultValues,
	});

	const [firstTime, setFirstTime] = useState(true);
	useEffect(() => {
		if (firstTime && defaultValues) {
			setSavedClusterState(null);
			setFirstTime(false);
		}
	}, [defaultValues, firstTime, setSavedClusterState]);

	const clusterName = form.watch('clusterName');
	const abbreviatedName = form.watch('abbreviatedName');
	const selectedDeployment = form.watch('deploymentDescription');
	const selectedPerformance = form.watch('performanceDescription');
	const selectedRegionPlans = form.watch('regionPlans');
	const selectedInstances = form.watch('instances');

	const regionNameToLatencyToRegion = selectedDeployment !== 'Dedicated'
		? colocatedRegionNameToLatencyToRegion
		: dedicatedRegionNameToLatencyToRegion;
	const regionLocations = selectedDeployment !== 'Dedicated'
		? regionLocationsColocated
		: regionLocationsDedicated;
	const regionLookup = selectedDeployment !== 'Dedicated'
		? colocatedRegionLookup
		: dedicatedRegionLookup;

	useEffect(function syncInstancesAndRegionsWithSelfManagedSelection() {
		const values = form.getValues();
		const isSelfManaged = selectedDeployment === 'Self-Hosted';
		if (!selectedDeployment) {
			return;
		}
		if (isSelfManaged) {
			if (values.abbreviatedName) {
				form.setValue('abbreviatedName', '');
			}
			if (values.regionPlans.length) {
				form.setValue('regionPlans', []);
			}
			if (!values.instances.length) {
				form.setValue('instances', [
					{
						secure: 'true',
						fqdn: '',
						port: defaultOperationsApiPort,
					},
				]);
			}
		} else {
			if (values.fqdn) {
				form.setValue('fqdn', '');
			}
			if (values.instances.length) {
				form.setValue('instances', []);
			}
			if (!values.regionPlans.length) {
				pickDefaultDeploymentPerformanceAndRegionPlans(form, planTypes, regionLocations);
			}
		}
	}, [form, planTypes, regionLocations, selectedDeployment]);

	const calculatedNames = useMemo(() => {
		const suggestedAbbreviatedName = collapseKebabsToMaxLength(
			toKebabCase(clusterName),
			specifiedAbbreviatedName.maxLength!,
		);
		return {
			suggestedAbbreviatedName,
			fullHostName: `${abbreviatedName || suggestedAbbreviatedName}.${
				organization.subdomain || 'your-org'
			}.harperfabric.com`,
		};
	}, [clusterName, abbreviatedName, organization]);
	const selectedPlan = useMemo(() => deploymentToPerformanceToPlan?.[selectedDeployment]?.[selectedPerformance], [
		deploymentToPerformanceToPlan,
		selectedDeployment,
		selectedPerformance,
	]);

	// A scoped grant is the request: its plan and regions fill the form and the pickers lock, since
	// central-manager refuses a claim that does not match the grant exactly. Create only — an
	// existing cluster's grant is already bound.
	const selectedGrantId = form.watch('grantId');
	const selectedGrant = useMemo(
		() => organization?.unboundGrants?.find((grant) => grant.id === selectedGrantId) ?? null,
		[organization?.unboundGrants, selectedGrantId],
	);
	const grantPrefill = useMemo(
		() => (clusterId
			? null
			: prefillFromGrant(selectedGrant, planTypes, regionLocationsColocated, regionLocationsDedicated)),
		[clusterId, selectedGrant, planTypes, regionLocationsColocated, regionLocationsDedicated],
	);
	const lockedByGrant = grantPrefill != null;
	useEffect(function fillFormFromGrant() {
		if (!grantPrefill) { return; }
		form.setValue('deploymentDescription', grantPrefill.deploymentDescription);
		form.setValue('performanceDescription', grantPrefill.performanceDescription);
		if (grantPrefill.regionPlans.length) { form.setValue('regionPlans', grantPrefill.regionPlans); }
		void form.trigger();
	}, [form, grantPrefill]);

	useEffect(function autoSelectRegionBasedOnAllowedRegionIds() {
		const allowedRegionIds = selectedPlan?.allowedRegionIds;
		// A frozen region set must reach the server exactly as the cluster already has it. Disabling
		// the select only stopped the customer changing it — these effects still rewrote the value
		// underneath, and the mutated set was what got submitted, which the server then refused.
		if (regionSetFrozen || lockedByGrant) { return; }
		if (allowedRegionIds?.length && selectedRegionPlans?.length === 1) {
			const firstRegionId = selectedRegionPlans[0].regionId;
			if (!isOrganizationRegionId(firstRegionId) && !allowedRegionIds.includes(firstRegionId)) {
				const possibleRegions = regionLocations?.filter(r => allowedRegionIds.includes(r.id));
				const chosenRegionName = regionLookup.get(firstRegionId)?.name;
				const regionToSelect = possibleRegions?.find(r => r.region === chosenRegionName)
					|| possibleRegions?.find(r => r.region === 'US') || possibleRegions?.[0];
				if (regionToSelect) {
					form.setValue('regionPlans.0.regionId', regionToSelect.id);
					void form.trigger();
				}
			}
		}
	}, [
		selectedPlan,
		selectedRegionPlans,
		form,
		regionNameToLatencyToRegion,
		regionLocations,
		regionSetFrozen,
		lockedByGrant,
	]);

	useEffect(function syncRegionSelectionsWithPossibleRegions() {
		const isSelfManaged = selectedDeployment === 'Self-Hosted';
		// Blanking a frozen region leaves the form unsatisfiable: the control is disabled, so nothing
		// can put a value back, and the schema requires one. The cluster is running in that region
		// whether or not it currently accepts new placements.
		if (regionSetFrozen || lockedByGrant) { return; }
		if (!isSelfManaged && Object.keys(regionNameToLatencyToRegion).length && selectedRegionPlans.length) {
			for (let i = 0; i < selectedRegionPlans.length; i++) {
				const regionPlan = selectedRegionPlans[i];
				if (!regionNameToLatencyToRegion[regionPlan.regionName]) {
					form.setValue(`regionPlans.${i}.regionName`, '');
				}
			}
		}
	}, [form, regionNameToLatencyToRegion, selectedDeployment, selectedRegionPlans, regionSetFrozen, lockedByGrant]);

	const totalPrice = !selectedPlan?.priceUsd
		? 0
		: selectedDeployment === 'Self-Hosted'
		? selectedInstances.length * selectedPlan.priceUsd
		: selectedRegionPlans.reduce((total, entry) => {
			const region = regionLookup.get(entry.regionId);
			if (!region) {
				return total;
			}
			// Central-manager mints a block per instance pair (rounded up) × quantity for a custom region.
			return total + (region.kind === 'organization'
				? selectedPlan.priceUsd * region.blocksPerUnit * (entry.quantity ?? 1)
				: selectedPlan.priceUsd * region.instanceCount / 2);
		}, 0);

	const expirationMonths = selectedPlan?.planLimits?.expirationMonths;
	const termMonths = isPositive(expirationMonths) && expirationMonths < 1000 ? expirationMonths : undefined;
	const monthlyPrice = termMonths ? totalPrice / termMonths : totalPrice;

	const onStartSaving = useCallback(({
		creating,
		deploymentDescription,
	}: {
		creating: boolean;
		deploymentDescription: string;
	}) =>
		toast.message(creating ? 'Creating Cluster' : 'Updating Cluster', {
			description: (
				<EstimatedProgressBar
					message="This may take a little bit, hold tight!"
					lateMessage="Still working on it... why don't you grab a coffee, and I'll let you know when it's done?"
					duration={deploymentDescription === 'Dedicated' ? 60_000 : 5_000}
				/>
			),
			duration: 0,
		}), []);

	const onClusterSavedCallback = useCallback(async ({
		clusterId,
		sourceClusterId,
		creating,
		toastId,
		isSelfManaged,
		skipGtmWait,
	}: {
		clusterId: string;
		sourceClusterId: string | undefined;
		creating: boolean;
		isSelfManaged: boolean;
		toastId: string | number;
		skipGtmWait?: boolean;
	}) => {
		// Only a Try Again create replaces its source. On an edit the source is the edited cluster itself, which an
		// update that fails straight away already shows as FAILED.
		if (creating && sourceClusterId) {
			const existingOrg = await getOrganization(organizationId);
			const sourceCluster = existingOrg.clusters?.find(c => c.id === sourceClusterId);
			if (isFailed(sourceCluster?.status)) {
				await terminateCluster(sourceClusterId);
			}
		}

		void queryClient.invalidateQueries({ queryKey: [organizationId], refetchType: 'active' });
		if (!creating) {
			void invalidateEntityQueries(queryClient, clusterId, { refetchType: 'active' });
		}

		void router.invalidate();
		if (isSelfManaged) {
			void navigate({ to: `/${organizationId}/${clusterId}/instances` });
		} else if (creating) {
			void navigate({ to: `/${organizationId}/${clusterId}/starting-up` });
		} else {
			void navigate({
				to: `/${organizationId}/${clusterId}/scaling`,
				search: skipGtmWait ? { immediate: true } : undefined,
			});
		}
		form.reset();
		toast.success(creating ? 'Cluster Created' : 'Cluster Updated', {
			id: toastId,
			description: isSelfManaged
				? undefined
				: creating
				? 'It is being provisioned now.'
				: 'The updates are being provisioned now.',
			duration: 5_000,
		});
	}, [queryClient, router, navigate, organizationId, form]);

	const executeChangesToCluster = useCallback(async () => {
		if (submitInFlight.current) { return; }
		const formData = form.getValues();
		const plans: ClusterUpsertRegionPlan[] = [];
		const plan = deploymentToPerformanceToPlan[formData.deploymentDescription][formData.performanceDescription];

		const isSelfManaged = formData.deploymentDescription === 'Self-Hosted';
		// A comp is claimed with its shape, not with what the pickers show: the server admits the claim
		// only when the pairs match exactly, and the pickers can carry one plan where a shape may carry two.
		const shape = !clusterId ? selectedGrant?.shape ?? [] : [];
		if (shape.length > 0) {
			plans.push(...plansFromShape(shape, formData.instances, defaultOperationsApiPort));
		} else if (isSelfManaged) {
			for (const instance of formData.instances) {
				plans.push({
					autoRenew: true,
					instanceFqdn: instance.fqdn,
					operationsApiPort: instance.port || defaultOperationsApiPort,
					operationsApiSecure: instance.secure === 'true',
					planId: plan.id,
				});
			}
		} else if (mode !== 'version') {
			for (const regionPlan of formData.regionPlans) {
				const region = regionNameToLatencyToRegion[regionPlan.regionName]?.[regionPlan.latencyDescription];
				// Validation above refuses an unresolvable region, so reaching here means the two
				// disagree. Throwing past the toast leaves a dead button; say so instead.
				if (!region) {
					toast.error('Region unavailable', {
						description: `${regionPlan.regionName} is not currently available. Contact us to move this cluster.`,
					});
					return;
				}
				plans.push({
					autoRenew: true,
					planId: plan.id,
					regionId: region.id,
					...(region.kind === 'organization' ? { quantity: regionPlan.quantity ?? 1 } : {}),
				});
			}
		}
		setSavedClusterState(null);
		const toastId = onStartSaving({ creating: !clusterId, deploymentDescription: formData.deploymentDescription });
		const clearToast = () => toast.dismiss(toastId);
		submitInFlight.current = true;
		const release = () => {
			submitInFlight.current = false;
		};
		if (clusterId) {
			submitEditClusterData(
				mode === 'version'
					? { id: clusterId, version: formData.version, skipGtmWait: formData.skipGtmWait }
					: { id: clusterId, regionPlans: plans, skipGtmWait: formData.skipGtmWait },
				{
					onSuccess: (data) =>
						onClusterSavedCallback({
							clusterId: data.id,
							sourceClusterId: formData.sourceClusterId,
							isSelfManaged,
							creating: false,
							toastId,
							skipGtmWait: formData.skipGtmWait,
						}),
					onError: clearToast,
					onSettled: release,
				},
			);
		} else {
			submitNewClusterData({
				abbreviatedName: isSelfManaged
					? undefined
					: (formData.abbreviatedName || calculatedNames.suggestedAbbreviatedName),
				autoRenew: true,
				fqdn: isSelfManaged && formData.fqdn || undefined,
				name: formData.clusterName,
				version: formData.version,
				organizationId,
				regionPlans: plans,
				// Omitted unless one was entered: the server claims a grant only when asked to.
				grantId: formData.grantId?.trim() || undefined,
			}, {
				onSuccess: (data) =>
					onClusterSavedCallback({
						clusterId: data.id,
						sourceClusterId: formData.sourceClusterId,
						isSelfManaged,
						creating: true,
						toastId,
					}),
				onError: clearToast,
				onSettled: release,
			});
		}
	}, [
		calculatedNames.suggestedAbbreviatedName,
		clusterId,
		selectedGrant,
		deploymentToPerformanceToPlan,
		form,
		onClusterSavedCallback,
		onStartSaving,
		organizationId,
		regionLookup,
		setSavedClusterState,
		submitEditClusterData,
		submitNewClusterData,
	]);

	const submitClusterDetailsForm = useCallback(() => {
		if (needsBillingStep({ mode, totalPrice, grantId: form.getValues('grantId') })) {
			setConfirmingPaymentDetails(true);
			return;
		}
		return executeChangesToCluster();
	}, [form, mode, executeChangesToCluster, totalPrice]);

	const onSaveStateForBillingRedirect = useCallback((redirecting: boolean) => {
		setSavedClusterState(redirecting ? { clusterId, ...form.getValues(), skipToBilling: true } : null);
	}, [clusterId, form, setSavedClusterState]);

	const onGoBackToDetails = useCallback(() => {
		setConfirmingPaymentDetails(false);
	}, []);

	const priceSummary = !isEnterprise && mode !== 'version'
		? (
			<aside
				aria-label="Price summary"
				className="min-w-0 rounded-2xl border border-primary/15 bg-primary/5 p-6 xl:order-2"
			>
				<p className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your plan</p>
				<dl>
					<dt className="text-sm text-muted-foreground">{termMonths ? 'Monthly Price' : 'Total Price'}</dt>
					<dd className="mt-2 font-bold">
						{selectedGrant
							? (
								<span className="text-4xl text-green">
									{selectedGrant.source === 'trial' ? 'Trial' : 'Complimentary'}
								</span>
							)
							: totalPrice > 0
							? (
								<span className="inline-flex items-baseline">
									<PriceDisplay price={monthlyPrice} />
									{!!termMonths && (
										<span className="text-base font-normal text-muted-foreground">
											/mo{termMonths > 1 && <sup>*</sup>}
										</span>
									)}
								</span>
							)
							: <span className="text-4xl text-green">Free</span>}
					</dd>
				</dl>
				{!!termMonths && termMonths > 1 && totalPrice > 0 && (
					<p className="mt-4 text-sm leading-relaxed text-muted-foreground">
						* Billed as {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalPrice)}{' '}
						every{' '}
						{pluralize(termMonths, 'month', 'months')}, or sooner if you reach a usage limit — then a new license is
						issued.
					</p>
				)}
				<div className="mt-5 border-t border-primary/15 pt-5">
					<Badge variant="warning">Beta pricing subject to change.</Badge>
				</div>
			</aside>
		)
		: null;
	return (
		<div className="space-y-7 py-5">
			<header className="flex items-start gap-4">
				<div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
					<Server className="size-6" aria-hidden="true" />
				</div>
				<div className="min-w-0">
					<p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						{mode === 'version' ? 'Cluster upgrade' : clusterId ? 'Manage your cluster' : 'Your infrastructure'}
					</p>
					<h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
						{confirmingPaymentDetails ? 'Cluster Billing' : 'Cluster Configuration'}
					</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						{confirmingPaymentDetails
							? 'Review your billing details before applying these changes.'
							: mode === 'version'
							? 'Keep your cluster up to date with the right Harper version.'
							: 'Configure your Harper cluster and define deployment plans.'}
					</p>
				</div>
			</header>
			<Form {...form}>
				{!confirmingPaymentDetails
					? (
						<>
							<form
								id="cluster-upsert-form"
								name="cluster-upsert-form"
								onSubmit={form.handleSubmit(submitClusterDetailsForm)}
							>
								<ClusterDetails
									priceSummary={priceSummary}
									calculatedNames={calculatedNames}
									clusterId={clusterId}
									deploymentToPerformanceToPlan={deploymentToPerformanceToPlan}
									form={form}
									isPending={isCreatePending || isEditPending}
									harperVersions={harperVersions}
									mode={mode}
									partialUpgrade={partialUpgrade}
									regionLocations={regionLocations}
									regionLookup={regionLookup}
									regionNameToLatencyToRegion={regionNameToLatencyToRegion}
									regionSetFrozen={regionSetFrozen}
									currentPlanId={currentPlanId}
									unboundGrants={organization?.unboundGrants}
									lockedByGrant={lockedByGrant}
									selectedDeployment={selectedDeployment}
									selectedPerformance={selectedPerformance}
									selectedPlan={selectedPlan}
									submitError={editFailure}
									totalPrice={totalPrice}
									isEnterprise={isEnterprise}
									cloudProvider={cloudProvider}
								/>
							</form>
						</>
					)
					: (
						<>
							<div className={priceSummary ? 'grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]' : ''}>
								{priceSummary}
								<Card className="min-w-0 xl:order-1">
									<CardHeader>
										<h2 className="flex items-center gap-2 text-base font-semibold">
											<CreditCard className="size-4 text-primary" aria-hidden="true" />Payment review
										</h2>
									</CardHeader>
									<CardContent>
										<ClusterBilling
											clusterId={clusterId}
											isPending={isCreatePending || isEditPending}
											onGoBackToDetails={onGoBackToDetails}
											onSaveStateForBillingRedirect={onSaveStateForBillingRedirect}
											onSubmit={executeChangesToCluster}
											organizationId={organizationId}
											selectedPlan={selectedPlan}
											submitError={editFailure}
										/>
									</CardContent>
								</Card>
							</div>
						</>
					)}
			</Form>
		</div>
	);
}
