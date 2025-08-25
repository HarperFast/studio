import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form } from '@/components/ui/form/Form';
import { defaultOperationsApiPort } from '@/config/constants';
import { getPlanTypesOptions } from '@/features/cluster/queries/getPlanTypesQuery';
import { useCreateNewClusterMutation } from '@/features/clusters/hooks/useCreateNewCluster';
import { ClusterBilling } from '@/features/clusters/modals/NewClusterModal/ClusterBilling';
import { ClusterDetails } from '@/features/clusters/modals/NewClusterModal/ClusterDetails';
import { calculateInstanceFQDN } from '@/features/clusters/modals/NewClusterModal/lib/calculateInstanceFQDN';
import {
	pickDefaultDeploymentPerformanceAndRegionPlans,
} from '@/features/clusters/modals/NewClusterModal/lib/pickDefaultDeploymentPerformanceAndRegionPlans';
import { NewClusterSchema } from '@/features/clusters/modals/NewClusterModal/newClusterSchema';
import { PriceDisplay } from '@/features/clusters/modals/NewClusterModal/PriceDisplay';
import {
	getRegionLocationsOptions,
	GetRegionLocationsParams,
} from '@/features/clusters/queries/getRegionLocationsQuery';
import { getOrganizationQueryOptions } from '@/features/organization/queries/getOrganizationQuery';
import { LocalStorageKeys, useLocalStorage } from '@/hooks/useLocalStorage';
import { SchemaRegionPlan } from '@/lib/api.gen';
import { groupThenKeyBy } from '@/lib/groupThenKeyBy';
import { sleep } from '@/lib/sleep';
import { collapseKebabsToMaxLength } from '@/lib/string/collapseKebabsToMaxLength';
import { stringsShareAPrefix } from '@/lib/string/stringsShareAPrefix';
import { toKebabCase } from '@/lib/string/to-kebab-case';
import { queryKeys } from '@/react-query/constants';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

interface NewClusterModalProps {
	organizationId: string;
	isModalOpen: boolean;
	setIsModalOpen: (isOpen: boolean) => void;
}

export function NewClusterModal({
	organizationId,
	isModalOpen,
	setIsModalOpen,
}: NewClusterModalProps) {
	const queryClient = useQueryClient();
	const { data: orgInfo } = useQuery(getOrganizationQueryOptions(organizationId));
	const { data: planTypes } = useQuery(getPlanTypesOptions());
	const [limitRegionParameters, setLimitRegionParameters] = useState<GetRegionLocationsParams>({ availableHosts: true });
	const { data: regionLocations } = useQuery(getRegionLocationsOptions(limitRegionParameters));
	const { mutate: submitNewClusterData, isPending } = useCreateNewClusterMutation();
	const [firstLoad, setFirstLoad] = useState(true);
	const [savedClusterState, setSavedClusterState] = useLocalStorage<z.infer<typeof NewClusterSchema> | null>(LocalStorageKeys.SavedClusterState, null);

	const [confirmingPaymentDetails, setConfirmingPaymentDetails] = useState(false);
	const deploymentToPerformanceToPlan = useMemo(() =>
		groupThenKeyBy(planTypes || [], 'deploymentDescription', 'performanceDescription'), [planTypes]);
	const regionNameToLatencyToRegion = useMemo(() =>
		groupThenKeyBy(regionLocations || [], 'region', 'latencyDescription'), [regionLocations]);

	useEffect(function restoreClusterModalStateAfterPaymentRedirect() {
		if (firstLoad && savedClusterState && !isModalOpen) {
			setIsModalOpen(true);
			setConfirmingPaymentDetails(true);
		}
		setFirstLoad(false);
	}, [firstLoad, isModalOpen, savedClusterState, setIsModalOpen]);

	const refineZod = useCallback((data: z.infer<typeof NewClusterSchema>, ctx: z.RefinementCtx) => {
		const names = new Set();
		const selectedPlan = deploymentToPerformanceToPlan?.[data.deploymentDescription]?.[data.performanceDescription];
		const isSelfManaged = data.deploymentDescription === 'Manage Your Own Installation/Configuration';
		if (isSelfManaged) {
			for (let i = 0; i < data.instances.length; i++) {
				const fqdn = calculateInstanceFQDN(data.instances[i]);
				if (!names.has(fqdn)) {
					names.add(fqdn);
				} else {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: [`instances.${i}.fqdn`],
						message: 'Every instance url must be unique!',
					});
				}
			}
		} else {
			for (let i = 0; i < data.regionPlans.length; i++) {
				const regionPlan = data.regionPlans[i];
				const region = regionNameToLatencyToRegion[regionPlan.regionName]?.[regionPlan.latencyDescription];
				if (!names.has(regionPlan.regionName)) {
					names.add(regionPlan.regionName);
				} else {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						path: [`regionPlans.${i}.regionName`],
						message: 'You can only select a region once!',
					});
				}
				if (selectedPlan?.allowedRegionIds?.length && region?.id && !selectedPlan.allowedRegionIds.includes(region.id)) {
					const prefixMatches = stringsShareAPrefix(selectedPlan.allowedRegionIds, region.id);
					if (!prefixMatches) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							path: [`regionPlans.${i}.regionName`],
							message: `This region is not available with the selected performance tier!`,
						});
					} else {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							path: [`regionPlans.${i}.latencyDescription`],
							message: `This latency is not available with the selected performance tier!`,
						});
					}
				}
			}
		}
	}, [deploymentToPerformanceToPlan, regionNameToLatencyToRegion]);

	const form = useForm({
		mode: 'onChange',
		resolver: zodResolver(NewClusterSchema.superRefine(refineZod)),
		defaultValues: savedClusterState ?? {
			systemName: '',
			abbreviatedName: '',
			regionPlans: [],
			instances: [],
			// The rest of the fields will be defaulted in the "pickDefaultDeploymentPerformanceAndRegionPlans"
			// useEffect below.
		},
	});

	useEffect(() => pickDefaultDeploymentPerformanceAndRegionPlans(form, planTypes, regionLocations), [form, planTypes, regionLocations]);

	const systemName = form.watch('systemName');
	const abbreviatedName = form.watch('abbreviatedName');
	const selectedDeployment = form.watch('deploymentDescription');
	const selectedPerformance = form.watch('performanceDescription');
	const selectedRegionPlans = form.watch('regionPlans');
	const selectedInstances = form.watch('instances');

	useEffect(() => {
		setLimitRegionParameters({
			availableHosts: selectedDeployment !== 'Dedicated for Cluster' ? true : undefined,
			organizationId: selectedDeployment === 'Dedicated for Organization' ? organizationId : undefined,
		});
	}, [organizationId, selectedDeployment]);

	useEffect(function syncInstancesAndRegionsWithSelfManagedSelection() {
		const values = form.getValues();
		const isSelfManaged = selectedDeployment === 'Manage Your Own Installation/Configuration';
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
			toKebabCase(systemName),
			NewClusterSchema.shape.abbreviatedName.maxLength!,
		);
		return {
			suggestedAbbreviatedName,
			fullHostName: `${abbreviatedName || suggestedAbbreviatedName}.${orgInfo?.subdomain || 'your-org'}.harperfabric.com`,
		};
	}, [systemName, abbreviatedName, orgInfo]);
	const selectedPlan = useMemo(() =>
		deploymentToPerformanceToPlan?.[selectedDeployment]?.[selectedPerformance], [deploymentToPerformanceToPlan, selectedDeployment, selectedPerformance]);

	useEffect(function autoSelectRegionBasedOnAllowedRegionIds() {
		const allowedRegionIds = selectedPlan?.allowedRegionIds;
		if (allowedRegionIds?.length && selectedRegionPlans?.length === 1) {
			const firstRegion = selectedRegionPlans[0];
			const firstSelectedRegion = regionNameToLatencyToRegion?.[firstRegion.regionName]?.[firstRegion.latencyDescription];
			if (!allowedRegionIds.includes(firstSelectedRegion?.id)) {
				const possibleRegions = regionLocations?.filter(r => allowedRegionIds.includes(r.id));
				const regionToSelect = possibleRegions?.find(r => r.region === 'Global') || possibleRegions?.[0];
				if (regionToSelect) {
					form.setValue('regionPlans.0.regionName', regionToSelect.region);
					form.setValue('regionPlans.0.latencyDescription', regionToSelect.latencyDescription);
					void form.trigger();
				}
			}
		}
	}, [selectedPlan, selectedRegionPlans, form, regionNameToLatencyToRegion, regionLocations]);

	useEffect(function syncRegionSelectionsWithPossibleRegions() {
		const isSelfManaged = selectedDeployment === 'Manage Your Own Installation/Configuration';
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
		: selectedDeployment === 'Manage Your Own Installation/Configuration'
			? selectedInstances.length * selectedPlan.priceUsd
			: selectedRegionPlans.reduce((total, region) => {
				const regionPlan = regionNameToLatencyToRegion?.[region.regionName!]?.[region.latencyDescription!];
				return total + (!regionPlan
					? 0
					: selectedPlan.priceUsd * regionPlan.instanceCount / 2);
			}, 0);

	const onClusterCreatedCallback = useCallback(() => {
		void queryClient.invalidateQueries({ queryKey: [queryKeys.organization], refetchType: 'active' });
		setIsModalOpen(false);
		setConfirmingPaymentDetails(false);
		form.reset();
	}, [form, queryClient, setIsModalOpen]);

	const submitCreateCluster = useCallback(async () => {
		const formData = form.getValues();
		const plans: SchemaRegionPlan[] = [];
		const plan = deploymentToPerformanceToPlan[formData.deploymentDescription][formData.performanceDescription];

		const isSelfManaged = formData.deploymentDescription === 'Manage Your Own Installation/Configuration';
		if (isSelfManaged) {
			for (const instance of formData.instances) {
				plans.push({
					planId: plan.id,
					autoRenew: true,
					operationsApiSecure: instance.secure === 'true',
					instanceFqdn: instance.fqdn,
					operationsApiPort: instance.port || defaultOperationsApiPort,
				});
			}
		} else {
			for (const regionPlan of formData.regionPlans) {
				const region = regionNameToLatencyToRegion[regionPlan.regionName][regionPlan.latencyDescription];
				plans.push({
					planId: plan.id,
					regionId: region.id,
					autoRenew: true,
				});
			}
		}
		setSavedClusterState(null);
		submitNewClusterData({
			organizationId,
			name: formData.systemName,
			abbreviatedName: isSelfManaged ? undefined : (formData.abbreviatedName || calculatedNames.suggestedAbbreviatedName),
			fqdn: isSelfManaged && formData.fqdn || undefined,
			autoRenew: true,
			regionPlans: plans,
		}, { onSuccess: onClusterCreatedCallback });
	}, [calculatedNames.suggestedAbbreviatedName, deploymentToPerformanceToPlan, form, onClusterCreatedCallback, organizationId, regionNameToLatencyToRegion, setSavedClusterState, submitNewClusterData]);

	const submitClusterDetailsForm = useCallback(() => {
		if (totalPrice > 0) {
			setConfirmingPaymentDetails(true);
			return;
		}
		return submitCreateCluster();
	}, [submitCreateCluster, totalPrice]);

	const onSaveStateForBillingRedirect = useCallback((redirecting: boolean) => {
		setSavedClusterState(redirecting ? form.getValues() : null);
	}, [form, setSavedClusterState]);

	const onOpenChange = useCallback(async () => {
		setIsModalOpen(false);
		await sleep(500);
		// Give it a breath to avoid a re-render.
		setConfirmingPaymentDetails(false);
	}, [setIsModalOpen]);

	const onGoBackToDetails = useCallback(() => {
		setConfirmingPaymentDetails(false);
	}, []);

	return (
		<Dialog open={isModalOpen} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[825px]">
				<DialogHeader>
					<div className="absolute top-6 right-12 text-right">
						<dt className="font-light">Total Price</dt>
						<dd className="font-bold"><PriceDisplay price={totalPrice} /></dd>
					</div>
				</DialogHeader>
				<Form {...form}>
					{!confirmingPaymentDetails
						? (<>
							<DialogTitle>Cluster Configuration</DialogTitle>
							<DialogDescription>Configure your Harper system and define deployment
								plans.</DialogDescription>

							<DialogTitle>System</DialogTitle>
							<form onSubmit={form.handleSubmit(submitClusterDetailsForm)}>
								<ClusterDetails
									deploymentToPerformanceToPlan={deploymentToPerformanceToPlan}
									calculatedNames={calculatedNames}
									form={form}
									isPending={isPending}
									regionLocations={regionLocations}
									regionNameToLatencyToRegion={regionNameToLatencyToRegion}
									selectedPlan={selectedPlan}
									selectedDeployment={selectedDeployment}
									selectedPerformance={selectedPerformance}
									totalPrice={totalPrice}
								/>
							</form>
						</>)
						: (<>
							<DialogTitle>Cluster Billing</DialogTitle>
							<DialogDescription>Please confirm the following billing details:</DialogDescription>

							<ClusterBilling
								isPending={isPending}
								onGoBackToDetails={onGoBackToDetails}
								onSaveStateForBillingRedirect={onSaveStateForBillingRedirect}
								onSubmit={submitCreateCluster}
							/>
						</>)
					}
				</Form>
			</DialogContent>
		</Dialog>
	);
}
