import { SimpleBrowseDataTable } from '@/components/SimpleBrowseDataTable';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { isRunning } from '@/components/ui/utils/badgeStatus';
import { useDataTableColumns } from '@/features/cluster/domains/constants/tableDefinition';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { useSetDomainIdsOnCluster } from '@/features/clusters/mutations/setDomainIdsOnCluster';
import {
	AddOrganizationDomainSchema,
	useAddDomainToOrganization,
} from '@/features/organization/mutations/addDomainToOrganization';
import { validateDomainInOrganization } from '@/features/organization/mutations/validateDomainInOrganization';
import { getOrganizationDomainsQueryOptions } from '@/features/organization/queries/getOrganizationDomains';
import { useOrganizationRolePermissions } from '@/hooks/usePermissions';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { SchemaOrganizationDomain } from '@/integrations/api/api.patch';
import { unique } from '@/lib/arrays/unique';
import { pluralize } from '@/lib/pluralize';
import { queryClient } from '@/react-query/queryClient';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { ListTodoIcon, PlusIcon, RefreshCwIcon, Save } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import z from 'zod';

export function DomainsManagement() {
	const { organizationId, clusterId }: { organizationId: string; clusterId: string } = useParams({ strict: false });
	const { data: cluster } = useSuspenseQuery(
		getClusterInfoQueryOptions(clusterId, true),
	);

	const { update } = useOrganizationRolePermissions(organizationId);
	const {
		data: organizationDomains,
		refetch,
		isFetching,
		isRefetching,
	} = useQuery(getOrganizationDomainsQueryOptions(organizationId));

	const pendingDomains = useMemo(
		() => organizationDomains?.filter(o => o.status === 'PENDING_VALIDATION') || [],
		[organizationDomains],
	);

	const [sortTableDataParams] = useState({
		attribute: 'domain',
		descending: false,
	});
	const sortingState = useMemo(
		() => [
			{
				desc: sortTableDataParams.descending,
				id: sortTableDataParams.attribute,
			},
		],
		[sortTableDataParams],
	);

	const onRefreshClick = useRefreshClick(refetch);

	const [selectedDomainIds, setSelectedDomainIds] = useState<string[]>([]);
	const onToggleDomainSelection = useCallback((domainId: string) => {
		setSelectedDomainIds((prev) =>
			prev.includes(domainId) ? prev.filter((id) => id !== domainId) : [...prev, domainId]
		);
	}, []);

	const { mutate: setDomainIds, isPending: isBindPending } = useSetDomainIdsOnCluster();

	const onBindClick = useCallback(() => {
		if (!isRunning(cluster.status)) {
			toast.error('Cluster is currently ' + cluster.status, { description: 'To bind a domain, it must be running.' });
			return;
		}

		setDomainIds({
			clusterId: cluster.id,
			domainIds: unique((cluster.domainIds?.slice() || []).concat(selectedDomainIds)),
			generateDomainCerts: true,
		}, {
			onSuccess: () => {
				void queryClient.invalidateQueries({ queryKey: [cluster.organizationId], refetchType: 'active' });
				toast.success('Domain(s) bound! Certificates are being generated in the background now.');
				setSelectedDomainIds([]);
			},
		});
	}, [cluster, selectedDomainIds, setDomainIds]);

	const { mutateAsync: addDomain, isPending: isAddPending } = useAddDomainToOrganization();
	const form = useForm({
		resolver: zodResolver(AddOrganizationDomainSchema),
		defaultValues: {
			domain: '',
			organizationId,
		},
	});

	const onSubmitClick = useCallback(
		async (formData: z.infer<typeof AddOrganizationDomainSchema>) => {
			if (formData) {
				const domains = formData.domain.split(/[,\s]+/).map((d: string) => d.trim()).filter(Boolean);
				for (const domain of domains) {
					await addDomain({ ...formData, domain });
				}
				form.reset();
				await refetch();
				toast.success(
					`${
						pluralize(domains.length, 'Domain', 'Domains')
					} added! Please add the txt record above to your domain registrar.`,
				);
			}
		},
		[addDomain, form, refetch],
	);

	const onValidateClick = useCallback(async () => {
		const message = `Validating ${pluralize(pendingDomains.length, 'domain', 'domains')}...`;
		const id = 'validatingDomains';
		let checked = 0;
		let failed = 0;
		for (const pendingDomain of pendingDomains) {
			try {
				toast.loading(message, {
					description: `${checked++} of ${pendingDomains.length} checked`,
					id,
				});
				await validateDomainInOrganization(pendingDomain.id);
			} catch {
				failed += 1;
			}
		}
		if (failed > 0) {
			toast.error('Validation failed!', {
				description:
					`Please make sure the TXT record has been put in place. You may need to wait a bit for the DNS change to propagate.`,
				id,
			});
		} else {
			await refetch();
			toast.success('Validation succeeded!', {
				description: `Please take a look at the next steps for newly verified domains.`,
				id,
			});
		}
	}, [pendingDomains]);

	const dataTableColumns = useDataTableColumns(cluster, selectedDomainIds, onToggleDomainSelection);

	const domainValue = form.watch('domain');
	const isApex = useMemo(() => {
		if (typeof domainValue !== 'string') { return false; }
		const parts = domainValue.trim().split('.');
		return parts.length === 2;
	}, [domainValue]);

	const suggestWww = useCallback(() => {
		if (typeof domainValue === 'string') {
			form.setValue('domain', `${domainValue.trim()}, www.${domainValue.trim()}`);
		}
	}, [domainValue, form]);

	return (
		<SimpleBrowseDataTable<SchemaOrganizationDomain>
			data={organizationDomains || []}
			isFetching={isFetching || isRefetching}
			columns={dataTableColumns}
			sortingState={sortingState}
		>
			<div className="w-full flex flex-col md:flex-row items-center md:justify-between md:space-x-2 space-y-2 md:space-y-0">
				{update && (
					<Form {...form}>
						<form
							id="cluster-add-domain-form"
							name="cluster-add-domain-form"
							onSubmit={form.handleSubmit(onSubmitClick)}
							className="flex gap-1 flex-col md:flex-row"
						>
							<FormField
								control={form.control}
								name="domain"
								render={({ field }) => (
									<FormItem className="flex-1">
										<FormLabel className="pb-1">New Domain Name</FormLabel>
										<FormControl>
											<Input type="text" enterKeyHint="done" autoComplete="off" {...field} />
										</FormControl>
										{isApex && (
											<div className="mt-1 flex gap-4">
												Adding an apex domain?
												<Button variant="positiveOutline" type="button" onClick={suggestWww}>
													Add www as well
												</Button>
											</div>
										)}
										<FormMessage>
											<span className="text-muted-foreground italic">
												Type in a domain like example.com or your.example.com, and you'll be guided through validating
												and binding your cluster to it.
											</span>
										</FormMessage>
									</FormItem>
								)}
							/>
							<div className="flex-0 self-start flex gap-1 md:pt-6.5">
								<Button
									type="submit"
									variant="submit"
									disabled={isAddPending}
								>
									<PlusIcon /> Add
								</Button>

								{pendingDomains.length > 0 && (
									<Button
										variant="positiveOutline"
										onClick={onValidateClick}
										accessKey="r"
										type="button"
										disabled={isFetching || isRefetching}
									>
										<ListTodoIcon />{' '}
										<span>
											<u>V</u>alidate
										</span>
									</Button>
								)}
								<Button
									variant="defaultOutline"
									onClick={onRefreshClick}
									accessKey="r"
									type="button"
									disabled={isFetching || isRefetching}
								>
									<RefreshCwIcon />{' '}
									<span className="hidden lg:inline-block">
										<u>R</u>efresh
									</span>
								</Button>
							</div>
						</form>
					</Form>
				)}

				{selectedDomainIds.length > 0 && (
					<div className="flex-0 self-start md:pt-6.5">
						<Button
							variant="submit"
							onClick={onBindClick}
							disabled={isBindPending}
						>
							<Save /> Bind {pluralize(selectedDomainIds.length, 'Domain', 'Domains')}
						</Button>
					</div>
				)}
			</div>
		</SimpleBrowseDataTable>
	);
}
