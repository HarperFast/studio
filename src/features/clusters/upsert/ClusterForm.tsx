import { EstimatedProgressBar } from '@/components/EstimatedProgressBar';
import { Form } from '@/components/ui/form/Form';
import { isFailed } from '@/components/ui/utils/badgeStatus';
import { defaultOperationsApiPort } from '@/config/constants';
import { useCreateNewClusterMutation } from '@/features/clusters/hooks/useCreateNewCluster';
import { useEditClusterMutation } from '@/features/clusters/hooks/useUpdateCluster';
import { terminateCluster } from '@/features/clusters/mutations/terminateCluster';
import { getOrganization } from '@/features/organization/queries/getOrganizationQuery';
import { SchemaPlan, SchemaRegion, SchemaRegionPlan } from '@/integrations/api/api.gen';
import { Organization } from '@/integrations/api/api.patch';
import { sortByField } from '@/lib/arrays/sort/byField';
import { groupThenKeyBy } from '@/lib/groupThenKeyBy';
import { collapseKebabsToMaxLength } from '@/lib/string/collapseKebabsToMaxLength';
import { stringsShareAPrefix } from '@/lib/string/stringsShareAPrefix';
import { toKebabCase } from '@/lib/string/to-kebab-case';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ClusterBilling } from './ClusterBilling';
import { ClusterDetails } from './ClusterDetails';
import { calculateInstanceFQDN } from './lib/calculateInstanceFQDN';
import { pickDefaultDeploymentPerformanceAndRegionPlans } from './lib/pickDefaultDeploymentPerformanceAndRegionPlans';
import { PriceDisplay } from './PriceDisplay';
import { UpsertClusterSchema, UpsertClusterSchemaType } from './upsertClusterSchema';

interface ClusterFormProps {
	alreadyUsingFree: boolean;
	clusterId?: string;
	defaultValues: UpsertClusterSchemaType;
	deploymentToPerformanceToPlan: Record<string, Record<string, SchemaPlan>>;
	organization: Organization;
	organizationId: string;
	planTypes: SchemaPlan[];
	regionLocationsColocated: SchemaRegion[];
	regionLocationsDedicated: SchemaRegion[];
	setSavedClusterState: (value: null | ({ clusterId?: string } & UpsertClusterSchemaType)) => void;
	startOffOnBilling: boolean;
}

export function ClusterForm({
	alreadyUsingFree,
	clusterId,
	defaultValues,
	deploymentToPerformanceToPlan,
	organization,
	organizationId,
	planTypes,
	regionLocationsColocated,
	regionLocationsDedicated,
	setSavedClusterState,
	startOffOnBilling,
}: ClusterFormProps) {
	const navigate = useNavigate();
	const router = useRouter();

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
			UpsertClusterSchema.shape.abbreviatedName.unwrap().maxLength!,
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
	}, [selectedPlan, selectedRegionPlans, form, regionNameToLatencyToRegion, regionLocations]);

	useEffect(function syncRegionSelectionsWithPossibleRegions() {
		const isSelfManaged = selectedDeployment === 'Self-Hosted';
		if (!isSelfManaged && Object.keys(regionNameToLatencyToRegion).length && selectedRegionPlans.length) {
			for (let i = 0; i < selectedRegionPlans.length; i++) {
				const regionPlan = selectedRegionPlans[i];
				if (!regionNameToLatencyToRegion[regionPlan.regionName]) {
					form.setValue(`regionPlans.${i}.regionName`, '');
				}
			}
		}
	}, [form, regionNameToLatencyToRegion, selectedDeployment, selectedRegionPlans]);

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
			duration: 120_000,
		}), []);

	const onClusterSavedCallback = useCallback(async ({
		clusterId,
		sourceClusterId,
		creating,
		toastId,
		isSelfManaged,
	}: {
		clusterId: string;
		sourceClusterId: string | undefined;
		creating: boolean;
		isSelfManaged: boolean;
		toastId: string | number;
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
			void queryClient.invalidateQueries({ queryKey: [clusterId], refetchType: 'active' });
		}

		void router.invalidate();
		if (isSelfManaged) {
			void navigate({ to: `/${organizationId}/${clusterId}/instances` });
		} else if (creating) {
			void navigate({ to: `/${organizationId}/${clusterId}/starting-up` });
		} else {
			void navigate({ to: `/${organizationId}/${clusterId}/scaling` });
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

	const submitCreateCluster = useCallback(async () => {
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
			submitEditClusterData({
				id: clusterId,
				regionPlans: plans,
			}, {
				onSuccess: (data) =>
					onClusterSavedCallback({
						clusterId: data.id,
						sourceClusterId: formData.sourceClusterId,
						isSelfManaged,
						creating: false,
						toastId,
					}),
				onError: clearToast,
			});
		} else {
			submitNewClusterData({
				abbreviatedName: isSelfManaged
					? undefined
					: (formData.abbreviatedName || calculatedNames.suggestedAbbreviatedName),
				autoRenew: true,
				fqdn: isSelfManaged && formData.fqdn || undefined,
				name: formData.clusterName,
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
		if (totalPrice > 0) {
			setConfirmingPaymentDetails(true);
			return;
		}
		return submitCreateCluster();
	}, [submitCreateCluster, totalPrice]);

	const onSaveStateForBillingRedirect = useCallback((redirecting: boolean) => {
		setSavedClusterState(redirecting ? { clusterId, ...form.getValues(), skipToBilling: true } : null);
	}, [clusterId, form, setSavedClusterState]);

	const onGoBackToDetails = useCallback(() => {
		setConfirmingPaymentDetails(false);
	}, []);

	return (
		<>
			<div className="absolute top-3 right-12 text-right">
				<dt className="font-light">Total Price</dt>
				<dd className="font-bold">
					<PriceDisplay price={totalPrice} />
				</dd>
			</div>
			<Form {...form}>
				{!confirmingPaymentDetails
					? (
						<>
							<h1 className="text-lg leading-none text-white font-semibold mb-4">Cluster Configuration</h1>
							<p className="text-muted-foreground text-sm mb-6">
								Configure your Harper cluster and define deployment plans.
							</p>

							<form onSubmit={form.handleSubmit(submitClusterDetailsForm)}>
								<ClusterDetails
									calculatedNames={calculatedNames}
									clusterId={clusterId}
									deploymentToPerformanceToPlan={deploymentToPerformanceToPlan}
									form={form}
									isPending={isCreatePending || isEditPending}
									regionLocations={regionLocations}
									regionNameToLatencyToRegion={regionNameToLatencyToRegion}
									selectedDeployment={selectedDeployment}
									selectedPerformance={selectedPerformance}
									selectedPlan={selectedPlan}
									totalPrice={totalPrice}
								/>
							</form>
						</>
					)
					: (
						<>
							<h1 className="text-lg leading-none text-white font-semibold mb-4">Cluster Billing</h1>
							<p className="text-muted-foreground text-sm mb-2">
								Please confirm the following billing details:
							</p>

							<ClusterBilling
								clusterId={clusterId}
								isPending={isCreatePending || isEditPending}
								onGoBackToDetails={onGoBackToDetails}
								onSaveStateForBillingRedirect={onSaveStateForBillingRedirect}
								onSubmit={submitCreateCluster}
								organizationId={organizationId}
								selectedPlan={selectedPlan}
							/>
						</>
					)}
			</Form>
		</>
	);
}
