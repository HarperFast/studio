import { EstimatedProgressBar } from '@/components/EstimatedProgressBar';
import { Badge } from '@/components/ui/badge';
import { Form } from '@/components/ui/form/Form';
import { isFailed } from '@/components/ui/utils/badgeStatus';
import { defaultOperationsApiPort } from '@/config/constants';
import { useCreateNewClusterMutation } from '@/features/clusters/hooks/useCreateNewCluster';
import { useEditClusterMutation } from '@/features/clusters/hooks/useUpdateCluster';
import { terminateCluster } from '@/features/clusters/mutations/terminateCluster';
import { HarperVersionsResponse } from '@/features/clusters/queries/getHarperVersionsQuery';
import { getOrganization } from '@/features/organization/queries/getOrganizationQuery';
import { SchemaPlan, SchemaRegion, SchemaRegionPlan } from '@/integrations/api/api.gen';
import { Organization } from '@/integrations/api/api.patch';
import { ENTERPRISE } from '@/integrations/api/orgType';
import { sortByField } from '@/lib/arrays/sort/byField';
import { groupThenKeyBy } from '@/lib/groupThenKeyBy';
import { pluralize } from '@/lib/pluralize';
import { collapseKebabsToMaxLength } from '@/lib/string/collapseKebabsToMaxLength';
import { stringsShareAPrefix } from '@/lib/string/stringsShareAPrefix';
import { toKebabCase } from '@/lib/string/to-kebab-case';
import { isPositive } from '@/lib/types/isPositive';
import { invalidateEntityQueries } from '@/react-query/invalidateEntityQueries';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { cx } from 'class-variance-authority';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ClusterBilling } from './ClusterBilling';
import { ClusterDetails } from './ClusterDetails';
import { calculateInstanceFQDN } from './lib/calculateInstanceFQDN';
import { PartialUpgrade } from './lib/detectPartialUpgrade';
import { pickDefaultDeploymentPerformanceAndRegionPlans } from './lib/pickDefaultDeploymentPerformanceAndRegionPlans';
import { PriceDisplay } from './PriceDisplay';
import { specifiedAbbreviatedName, UpsertClusterSchema, UpsertClusterSchemaType } from './upsertClusterSchema';

interface ClusterFormProps {
	alreadyUsingFree: boolean;
	clusterId?: string;
	defaultValues: UpsertClusterSchemaType;
	deploymentToPerformanceToPlan: Record<string, Record<string, SchemaPlan>>;
	harperVersions: HarperVersionsResponse | undefined;
	mode: 'version' | undefined;
	organization: Organization;
	organizationId: string;
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
	defaultValues,
	deploymentToPerformanceToPlan,
	harperVersions,
	mode,
	organization,
	organizationId,
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
	const isEnterprise = organization?.type === ENTERPRISE;
	const cloudProvider = organization?.channel === 'Akamai' ? 'linode' : undefined;

	const queryClient = useQueryClient();
	const { mutate: submitNewClusterData, isPending: isCreatePending } = useCreateNewClusterMutation();
	const { mutate: submitEditClusterData, isPending: isEditPending } = useEditClusterMutation();

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

	const refineZod = useCallback((data: UpsertClusterSchemaType, ctx: z.RefinementCtx) => {
		const names = new Set();
		const selectedPlan = deploymentToPerformanceToPlan?.[data.deploymentDescription]?.[data.performanceDescription];
		const isSelfManaged = data.deploymentDescription === 'Self-Hosted';
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
			const regionNameToLatencyToRegion = selectedPlan?.deploymentDescription !== 'Dedicated'
				? colocatedRegionNameToLatencyToRegion
				: dedicatedRegionNameToLatencyToRegion;

			for (let i = 0; i < data.regionPlans.length; i++) {
				const regionPlan = data.regionPlans[i];
				const region = regionNameToLatencyToRegion[regionPlan.regionName]?.[regionPlan.latencyDescription];
				if (!names.has(regionPlan.regionName)) {
					names.add(regionPlan.regionName);
				} else {
					ctx.addIssue({
						code: 'custom',
						path: [`regionPlans.${i}.regionName`],
						message: 'You can only select a region once!',
					});
				}
				if (selectedPlan?.allowedRegionIds?.length && region?.id) {
					if (!selectedPlan.allowedRegionIds.includes(region.id)) {
						const prefixMatches = stringsShareAPrefix(selectedPlan.allowedRegionIds, region.id);
						if (!prefixMatches) {
							ctx.addIssue({
								code: 'custom',
								path: [`regionPlans.${i}.regionName`],
								message: `This region is not available with the selected performance tier!`,
							});
						} else {
							ctx.addIssue({
								code: 'custom',
								path: [`regionPlans.${i}.latencyDescription`],
								message: `This latency is not available with the selected performance tier!`,
							});
						}
					} else if (i >= 1) {
						ctx.addIssue({
							code: 'custom',
							path: [`regionPlans.${i}.regionName`],
							message: `You can only select one region with this performance tier!`,
						});
					}
				}
			}
		}
	}, [
		alreadyUsingFree,
		colocatedRegionNameToLatencyToRegion,
		dedicatedRegionNameToLatencyToRegion,
		deploymentToPerformanceToPlan,
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

	useEffect(function autoSelectRegionBasedOnAllowedRegionIds() {
		const allowedRegionIds = selectedPlan?.allowedRegionIds;
		// A frozen region set must reach the server exactly as the cluster already has it. Disabling
		// the select only stopped the customer changing it — these effects still rewrote the value
		// underneath, and the mutated set was what got submitted, which the server then refused.
		if (regionSetFrozen) { return; }
		if (allowedRegionIds?.length && selectedRegionPlans?.length === 1) {
			const firstRegion = selectedRegionPlans[0];
			const firstSelectedRegion = regionNameToLatencyToRegion?.[firstRegion.regionName]
				?.[firstRegion.latencyDescription];
			if (!allowedRegionIds.includes(firstSelectedRegion?.id)) {
				const possibleRegions = regionLocations?.filter(r => allowedRegionIds.includes(r.id));
				const regionToSelect = possibleRegions?.find(r => r.region === 'US') || possibleRegions?.[0];
				if (regionToSelect) {
					form.setValue('regionPlans.0.regionName', regionToSelect.region);
					form.setValue('regionPlans.0.latencyDescription', regionToSelect.latencyDescription);
					void form.trigger();
				}
			}
		}
	}, [selectedPlan, selectedRegionPlans, form, regionNameToLatencyToRegion, regionLocations, regionSetFrozen]);

	useEffect(function syncRegionSelectionsWithPossibleRegions() {
		const isSelfManaged = selectedDeployment === 'Self-Hosted';
		// Blanking a frozen region leaves the form unsatisfiable: the control is disabled, so nothing
		// can put a value back, and the schema requires one. The cluster is running in that region
		// whether or not it currently accepts new placements.
		if (regionSetFrozen) { return; }
		if (!isSelfManaged && Object.keys(regionNameToLatencyToRegion).length && selectedRegionPlans.length) {
			for (let i = 0; i < selectedRegionPlans.length; i++) {
				const regionPlan = selectedRegionPlans[i];
				if (!regionNameToLatencyToRegion[regionPlan.regionName]) {
					form.setValue(`regionPlans.${i}.regionName`, '');
				}
			}
		}
	}, [form, regionNameToLatencyToRegion, selectedDeployment, selectedRegionPlans, regionSetFrozen]);

	const totalPrice = !selectedPlan?.priceUsd
		? 0
		: selectedDeployment === 'Self-Hosted'
		? selectedInstances.length * selectedPlan.priceUsd
		: selectedRegionPlans.reduce((total, region) => {
			const regionPlan = regionNameToLatencyToRegion?.[region.regionName!]?.[region.latencyDescription!];
			return total + (!regionPlan
				? 0
				: selectedPlan.priceUsd * regionPlan.instanceCount / 2);
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
		if (sourceClusterId) {
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
		const formData = form.getValues();
		const plans: SchemaRegionPlan[] = [];
		const plan = deploymentToPerformanceToPlan[formData.deploymentDescription][formData.performanceDescription];

		const isSelfManaged = formData.deploymentDescription === 'Self-Hosted';
		if (isSelfManaged) {
			for (const instance of formData.instances) {
				plans.push({
					autoRenew: true,
					instanceFqdn: instance.fqdn,
					operationsApiPort: instance.port || defaultOperationsApiPort,
					operationsApiSecure: instance.secure === 'true',
					planId: plan.id,
				});
			}
		} else {
			for (const regionPlan of formData.regionPlans) {
				const region = regionNameToLatencyToRegion[regionPlan.regionName][regionPlan.latencyDescription];
				plans.push({
					autoRenew: true,
					planId: plan.id,
					regionId: region.id,
				});
			}
		}
		setSavedClusterState(null);
		const toastId = onStartSaving({ creating: !clusterId, deploymentDescription: formData.deploymentDescription });
		const clearToast = () => toast.dismiss(toastId);
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
			});
		}
	}, [
		calculatedNames.suggestedAbbreviatedName,
		clusterId,
		deploymentToPerformanceToPlan,
		form,
		onClusterSavedCallback,
		onStartSaving,
		organizationId,
		regionNameToLatencyToRegion,
		setSavedClusterState,
		submitEditClusterData,
		submitNewClusterData,
	]);

	const submitClusterDetailsForm = useCallback(() => {
		if (mode !== 'version' && totalPrice > 0) {
			setConfirmingPaymentDetails(true);
			return;
		}
		return executeChangesToCluster();
	}, [mode, executeChangesToCluster, totalPrice]);

	const onSaveStateForBillingRedirect = useCallback((redirecting: boolean) => {
		setSavedClusterState(redirecting ? { clusterId, ...form.getValues(), skipToBilling: true } : null);
	}, [clusterId, form, setSavedClusterState]);

	const onGoBackToDetails = useCallback(() => {
		setConfirmingPaymentDetails(false);
	}, []);

	const pricingMarginRight = !isEnterprise && 'mr-37.5';
	return (
		<>
			{!isEnterprise && mode !== 'version' && (
				<div className="absolute top-3 right-4 md:right-12 flex flex-col items-end text-right">
					<dt className="font-light">{termMonths ? 'Monthly Price' : 'Total Price'}</dt>
					<dd className="font-bold">
						{totalPrice > 0
							? (
								<span className="inline-flex items-baseline">
									<PriceDisplay price={monthlyPrice} />
									{!!termMonths && (
										<span className="font-light text-base text-muted-foreground">
											/mo{termMonths > 1 && <sup>*</sup>}
										</span>
									)}
								</span>
							)
							: <span className="text-4xl text-green">Free</span>}
					</dd>
				</div>
			)}
			<Form {...form}>
				{!confirmingPaymentDetails
					? (
						<>
							<h1 className={cx('text-lg leading-none text-foreground font-semibold mb-4', pricingMarginRight)}>
								Cluster Configuration
							</h1>
							<div className={cx('mb-6 flex flex-col items-start gap-2', pricingMarginRight)}>
								<p className="sr-only">Configure your Harper cluster and define deployment plans.</p>
								{!isEnterprise && mode !== 'version' && (
									<>
										<Badge variant="warning">Beta pricing subject to change.</Badge>
										{!!termMonths && termMonths > 1 && totalPrice > 0 && (
											<p className="max-w-prose text-xs font-light text-muted-foreground">
												* Billed as{' '}
												{new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalPrice)}{' '}
												every{' '}
												{pluralize(termMonths, 'month', 'months')}, or sooner if you reach a usage limit — then a new
												license is issued.
											</p>
										)}
									</>
								)}
							</div>

							<form
								id="cluster-upsert-form"
								name="cluster-upsert-form"
								onSubmit={form.handleSubmit(submitClusterDetailsForm)}
							>
								<ClusterDetails
									calculatedNames={calculatedNames}
									clusterId={clusterId}
									deploymentToPerformanceToPlan={deploymentToPerformanceToPlan}
									form={form}
									isPending={isCreatePending || isEditPending}
									harperVersions={harperVersions}
									mode={mode}
									partialUpgrade={partialUpgrade}
									regionLocations={regionLocations}
									regionNameToLatencyToRegion={regionNameToLatencyToRegion}
									regionSetFrozen={regionSetFrozen}
									currentPlanId={currentPlanId}
									selectedDeployment={selectedDeployment}
									selectedPerformance={selectedPerformance}
									selectedPlan={selectedPlan}
									totalPrice={totalPrice}
									isEnterprise={isEnterprise}
									cloudProvider={cloudProvider}
								/>
							</form>
						</>
					)
					: (
						<>
							<h1 className={cx('text-lg leading-none text-foreground font-semibold mb-4', pricingMarginRight)}>
								Cluster Billing
							</h1>
							<p className={cx('text-muted-foreground text-sm mb-2', pricingMarginRight)}>
								Please confirm the following billing details:
							</p>

							<ClusterBilling
								clusterId={clusterId}
								isPending={isCreatePending || isEditPending}
								onGoBackToDetails={onGoBackToDetails}
								onSaveStateForBillingRedirect={onSaveStateForBillingRedirect}
								onSubmit={executeChangesToCluster}
								organizationId={organizationId}
								selectedPlan={selectedPlan}
							/>
						</>
					)}
			</Form>
		</>
	);
}
