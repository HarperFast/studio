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
import { allowedRegionIdsFor, shapeCoversRequest, trialScope } from '@/features/clusters/upsert/lib/grantScope';
import { needsBillingStep } from '@/features/clusters/upsert/lib/needsBillingStep';
import { getOrganization } from '@/features/organization/queries/getOrganizationQuery';
import { useIsOrganizationAdmin } from '@/hooks/usePermissions';
import { SchemaPlan, SchemaRegion } from '@/integrations/api/api.gen';
import { ClusterGrant, ClusterUpsertRegionPlan, Organization, OrganizationRegion } from '@/integrations/api/api.patch';
import { isUnrestrictedOrgType, onContractedTerms } from '@/integrations/api/orgType';
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
	/** Lowest planLevel central-manager accepts for this cluster; unset when creating or self-hosted. */
	planLevelFloor?: number;
	/** The cluster's live grant when editing, so an unchanged free plan reads as the trial or comp it is. */
	currentGrant?: ClusterGrant | null;
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
	planLevelFloor,
	currentGrant,
	setSavedClusterState,
	startOffOnBilling,
}: ClusterFormProps) {
	const navigate = useNavigate();
	const router = useRouter();
	const isEnterprise = onContractedTerms(organization, clusterId);
	const mayRedeemPromoCode = useIsOrganizationAdmin(organizationId) && !clusterId
		&& !isUnrestrictedOrgType(organization?.type);
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
		if (!selectedPlan) {
			ctx.addIssue({
				code: 'custom',
				path: ['performanceDescription'],
				message: 'This performance tier is no longer available. Please choose another.',
			});
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
			let catalogRows = 0;
			const voucherRegionIds = clusterId
				? null
				: trialScope(organization?.unboundGrants?.find((grant) => grant.id === data.grantId))?.regionIds ?? null;
			for (let i = 0; i < data.regionPlans.length; i++) {
				const regionPlan = data.regionPlans[i];
				const region = regionLookup.get(regionPlan.regionId);
				if (!region) {
					if (regionPlan.regionId) {
						ctx.addIssue({
							code: 'custom',
							path: [`regionPlans.${i}.regionId`],
							message: 'This region is not currently available. Contact us to move this cluster.',
						});
					}
					continue;
				}
				const cohort = regionCohortKey(region);
				if (!names.has(cohort)) {
					names.add(cohort);
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
					if (voucherRegionIds && !voucherRegionIds.includes(region.id)) {
						ctx.addIssue({
							code: 'custom',
							path: [`regionPlans.${i}.regionId`],
							message: 'This custom region is not covered by the selected voucher.',
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
				catalogRows += 1;
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
					} else if (catalogRows > 1) {
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
		}
	}, [
		alreadyUsingFree,
		canUseCustomRegions,
		clusterId,
		colocatedRegionLookup,
		dedicatedRegionLookup,
		deploymentToPerformanceToPlan,
		mode,
		organization?.unboundGrants,
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
			: prefillFromGrant(selectedGrant, planTypes)),
		[clusterId, selectedGrant, planTypes],
	);
	const lockedByGrant = grantPrefill != null;
	// A trial voucher's allow-lists narrow the pickers: central-manager refuses a claim outside them.
	const scope = useMemo(() => (clusterId ? null : trialScope(selectedGrant)), [clusterId, selectedGrant]);
	const allowedRegionIds = useMemo(() => allowedRegionIdsFor(selectedPlan, scope), [selectedPlan, scope]);
	const scopedDeployments = useMemo(
		() =>
			scope?.planIds
				? [...new Set(planTypes.filter((p) => scope.planIds!.includes(p.id)).map((p) => p.deploymentDescription))]
					.filter((d): d is string => !!d)
				: null,
		[scope, planTypes],
	);
	const deploymentLockedByGrant = scopedDeployments?.length === 1;
	useEffect(function selectTheOnlyScopedDeployment() {
		if (deploymentLockedByGrant && selectedDeployment !== scopedDeployments[0]) {
			form.setValue('deploymentDescription', scopedDeployments[0]);
			void form.trigger();
		}
	}, [deploymentLockedByGrant, form, scopedDeployments, selectedDeployment]);
	// A live comp waives the card for exactly what its shape names — the test central-manager applies.
	const coveredByComp = useMemo(() => {
		if (!clusterId || currentGrant?.source !== 'comped' || !currentGrant.isActive) { return false; }
		const regionIds = selectedDeployment === 'Self-Hosted'
			? selectedInstances.map(() => null)
			: selectedRegionPlans.map((rp) => regionLookup.get(rp.regionId)?.id);
		return shapeCoversRequest(currentGrant.shape, selectedPlan?.id, regionIds);
	}, [
		clusterId,
		currentGrant,
		regionLookup,
		selectedDeployment,
		selectedInstances,
		selectedPlan,
		selectedRegionPlans,
	]);
	useEffect(function fillFormFromGrant() {
		if (!grantPrefill) { return; }
		form.setValue('deploymentDescription', grantPrefill.deploymentDescription);
		form.setValue('performanceDescription', grantPrefill.performanceDescription);
		if (grantPrefill.regionPlans.length) { form.setValue('regionPlans', grantPrefill.regionPlans); }
		void form.trigger();
	}, [form, grantPrefill]);

	useEffect(function autoSelectRegionBasedOnAllowedRegionIds() {
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
		allowedRegionIds,
		selectedPlan,
		selectedRegionPlans,
		form,
		regionLocations,
		regionSetFrozen,
		lockedByGrant,
	]);

	const remapFromDeployment = useRef(selectedDeployment);
	useEffect(function syncRegionSelectionsWithPossibleRegions() {
		const isSelfManaged = selectedDeployment === 'Self-Hosted';
		// Blanking a frozen region leaves the form unsatisfiable: the control is disabled, so nothing
		// can put a value back, and the schema requires one. The cluster is running in that region
		// whether or not it currently accepts new placements.
		if (regionSetFrozen || lockedByGrant) { return; }
		if (isSelfManaged || !regionLookup.size || !selectedRegionPlans.length) {
			return;
		}
		// Only a deployment switch remaps: a refetch that drops a tier must not swap it for a sibling.
		const deploymentSwitched = remapFromDeployment.current !== selectedDeployment;
		remapFromDeployment.current = selectedDeployment;
		if (!deploymentSwitched) {
			return;
		}
		let remapped = false;
		for (let i = 0; i < selectedRegionPlans.length; i++) {
			const { regionId } = selectedRegionPlans[i];
			// A custom region is deployment-agnostic; one the lookup lacks is pending a refetch (or gone),
			// which validation reports without discarding the selection.
			if (!regionId || regionLookup.has(regionId) || isOrganizationRegionId(regionId)) {
				continue;
			}
			const previous = colocatedRegionLookup.get(regionId) ?? dedicatedRegionLookup.get(regionId);
			if (!previous) {
				continue;
			}
			const previousTier = previous.kind === 'catalog' ? previous.latencyDescription.split(' ')[0].toLowerCase() : '';
			const replacement = regionLocations?.find(region =>
				region.region === previous.name && region.latencyDescription.split(' ')[0].toLowerCase() === previousTier
			)
				?? regionLocations?.find(region =>
					region.region === previous.name
				);
			form.setValue(`regionPlans.${i}.regionId`, replacement?.id ?? '');
			remapped = true;
		}
		if (remapped) {
			void form.trigger('regionPlans');
		}
	}, [
		colocatedRegionLookup,
		dedicatedRegionLookup,
		form,
		lockedByGrant,
		regionLocations,
		regionLookup,
		regionSetFrozen,
		selectedDeployment,
		selectedRegionPlans,
	]);

	useEffect(function revalidateCustomRegionsWhenLookupChanges() {
		// A custom region defined inline only resolves once its refetch lands.
		if (form.getValues('regionPlans').some(entry => isOrganizationRegionId(entry.regionId))) {
			void form.trigger('regionPlans');
		}
	}, [form, regionLookup]);

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
		// Claimed before the validation below awaits, or a second click gets past the check meanwhile.
		submitInFlight.current = true;
		// Payment review submits without the details form, and a draft restored after a billing redirect
		// can be stale: a region, a custom region's shape or the staff rules may have changed meanwhile.
		let valid: boolean;
		try {
			valid = await form.trigger();
		} catch (error) {
			submitInFlight.current = false;
			throw error;
		}
		if (!valid) {
			submitInFlight.current = false;
			toast.error('Some cluster details are no longer valid. Please review them.');
			setConfirmingPaymentDetails(false);
			return;
		}
		const formData = form.getValues();
		const plans: ClusterUpsertRegionPlan[] = [];
		const plan = deploymentToPerformanceToPlan[formData.deploymentDescription]?.[formData.performanceDescription];

		const isSelfManaged = formData.deploymentDescription === 'Self-Hosted';
		// A comp is claimed with its shape, not with what the pickers show: the server admits the claim
		// only when the pairs match exactly, and the pickers can carry one plan where a shape may carry two.
		const shape = !clusterId ? selectedGrant?.shape ?? [] : [];
		if (!plan && !shape.length && (isSelfManaged || mode !== 'version')) {
			submitInFlight.current = false;
			toast.error('The selected performance tier is no longer available. Please choose another.');
			setConfirmingPaymentDetails(false);
			return;
		}
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
				const region = regionLookup.get(regionPlan.regionId);
				if (!region) {
					submitInFlight.current = false;
					toast.error('A selected region is no longer available. Please review your regions.');
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
		if (needsBillingStep({ mode, totalPrice, grantId: form.getValues('grantId'), coveredByGrant: coveredByComp })) {
			setConfirmingPaymentDetails(true);
			return;
		}
		return executeChangesToCluster();
	}, [form, mode, executeChangesToCluster, totalPrice, coveredByComp]);

	const onSaveStateForBillingRedirect = useCallback((redirecting: boolean) => {
		setSavedClusterState(redirecting ? { clusterId, ...form.getValues(), skipToBilling: true } : null);
	}, [clusterId, form, setSavedClusterState]);

	const onGoBackToDetails = useCallback(() => {
		setConfirmingPaymentDetails(false);
	}, []);

	const labelledGrant = selectedGrant
		?? (currentGrant && ['trial', 'comped'].includes(currentGrant.source) && (totalPrice === 0 || coveredByComp)
			? currentGrant
			: null);
	const grantLabel = labelledGrant && (labelledGrant.source === 'trial' ? 'Trial' : 'Complimentary');
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
						{grantLabel
							? <span className="text-3xl text-green">{grantLabel}</span>
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
				{!grantLabel && !!termMonths && termMonths > 1 && totalPrice > 0 && (
					<p className="mt-4 text-sm leading-relaxed text-muted-foreground">
						* Billed as {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalPrice)}{' '}
						every {pluralize(termMonths, 'month', 'months')}. Usage beyond that is added to your next bill.
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
									planLevelFloor={planLevelFloor}
									unboundGrants={organization?.unboundGrants}
									promoCodeOrganizationId={mayRedeemPromoCode ? organizationId : undefined}
									lockedByGrant={lockedByGrant}
									deploymentLockedByGrant={deploymentLockedByGrant}
									grantPlanIds={scope?.planIds ?? null}
									grantRegionIds={scope?.regionIds ?? null}
									allowedRegionIds={allowedRegionIds}
									coveredByGrant={coveredByComp}
									organizationId={organizationId}
									canUseCustomRegions={canUseCustomRegions}
									canDefineCustomRegions={canDefineCustomRegions}
									lockedOrganizationRegionIds={lockedOrganizationRegionIds}
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
