import { SimpleBrowseDataTable } from '@/components/SimpleBrowseDataTable';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { SubmitErrorMessage } from '@/features/auth/components/SubmitErrorMessage';
import {
	addDomainsSequentially,
	describeDomainFailures,
	domainNameCounts,
	isIndeterminate,
	MAX_DOMAINS_PER_SUBMIT,
	MAX_INPUT_LENGTH,
	namesCreated,
	parseDomainList,
	unresolvedFailures,
	withinReconcileWindow,
} from '@/features/cluster/domains/addDomainsSequentially';
import { bindableDomainIds } from '@/features/cluster/domains/canBindDomain';
import { useDataTableColumns } from '@/features/cluster/domains/constants/tableDefinition';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { DomainChangeRefusal } from '@/features/clusters/mutations/describeDomainChangeRefusal';
import {
	DomainChangeRefusedError,
	useIsSettingDomainIds,
	useSetDomainIdsOnCluster,
} from '@/features/clusters/mutations/setDomainIdsOnCluster';
import {
	AddOrganizationDomainSchema,
	DOMAIN_REQUIRED_MESSAGE,
	useAddDomainToOrganization,
} from '@/features/organization/mutations/addDomainToOrganization';
import { isDeletingDomain, useIsDeletingDomain } from '@/features/organization/mutations/deleteDomain';
import { validateDomainInOrganization } from '@/features/organization/mutations/validateDomainInOrganization';
import { getOrganizationDomainsQueryOptions } from '@/features/organization/queries/getOrganizationDomains';
import { useOrganizationRolePermissions } from '@/hooks/usePermissions';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { SchemaOrganizationDomain } from '@/integrations/api/api.patch';
import { pluralize } from '@/lib/pluralize';
import { describeError } from '@/react-query/queryClient';
import { zodResolver } from '@hookform/resolvers/zod';
import { onlineManager, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { ListTodoIcon, PlusIcon, RefreshCwIcon, Save } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import z from 'zod';

function describeDomainChangeFailure(error: Error): DomainChangeRefusal {
	return error instanceof DomainChangeRefusedError
		? { message: error.message, needsSupport: error.needsSupport }
		: { message: `The domain change didn't go through: ${describeError(error).message}`, needsSupport: false };
}

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
		isPending: isDomainListPending,
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

	const domainIdsToBind = useMemo(
		() => bindableDomainIds(selectedDomainIds, organizationDomains, cluster),
		[cluster, organizationDomains, selectedDomainIds],
	);

	const domainChange = useSetDomainIdsOnCluster();
	const { mutate: setDomainIds } = domainChange;
	const settingDomainIds = useIsSettingDomainIds();
	const deletingDomain = useIsDeletingDomain();
	const activeQueryClient = useQueryClient();

	const onBindClick = useCallback(() => {
		// From the query client, not this render: a removal reaches the button a render after it
		// starts or lands, and a click in between would still send the domain being removed.
		if (isDeletingDomain(activeQueryClient)) {
			return;
		}
		const toBind = bindableDomainIds(
			selectedDomainIds,
			activeQueryClient.getQueryData(getOrganizationDomainsQueryOptions(organizationId).queryKey),
			cluster,
		);
		if (toBind.length === 0) {
			return;
		}

		setDomainIds({
			clusterId: cluster.id,
			organizationId,
			add: toBind,
			generateDomainCerts: true,
		}, {
			onSuccess: () => {
				void activeQueryClient.invalidateQueries({ queryKey: [cluster.organizationId], refetchType: 'active' });
				toast.success('Domain(s) bound! Certificates are being generated in the background now.');
				setSelectedDomainIds([]);
			},
		});
	}, [activeQueryClient, cluster, organizationId, selectedDomainIds, setDomainIds]);

	const onUnbindClick = useCallback((domainId: string) => {
		// No `generateDomainCerts`: the flag is cluster-wide, so restating it here would decide cert
		// intent for every domain that stays bound.
		setDomainIds({ clusterId: cluster.id, organizationId, remove: domainId }, {
			onSuccess: () => {
				void activeQueryClient.invalidateQueries({ queryKey: [cluster.organizationId], refetchType: 'active' });
				toast.success('Domain unbound!');
			},
		});
	}, [activeQueryClient, cluster.id, cluster.organizationId, organizationId, setDomainIds]);

	const domainChangeFailure = domainChange.error && domainChange.variables?.clusterId === cluster.id
		? describeDomainChangeFailure(domainChange.error)
		: undefined;

	const { mutateAsync: addDomain } = useAddDomainToOrganization();
	const form = useForm({
		resolver: zodResolver(AddOrganizationDomainSchema),
		defaultValues: {
			domain: '',
			organizationId,
		},
	});

	// Every control the settle path rewrites shares one gate. `isDomainListPending` covers the
	// first load: without a pre-submit list nothing can be credited, so a POST that commits and
	// then times out in that window would invite a retry that creates a second PENDING row. A
	// failed load leaves `isPending` false — crediting stays off, but the form still works.
	const formLocked = isDomainListPending || form.formState.isSubmitting;

	const onSubmitClick = useCallback(
		async (formData: z.infer<typeof AddOrganizationDomainSchema>) => {
			if (formData.domain.length > MAX_INPUT_LENGTH) {
				form.setError('domain', {
					type: 'server',
					message: `That is too much text to be domain names. Paste at most ${MAX_DOMAINS_PER_SUBMIT}.`,
				});
				return;
			}
			const attempted = parseDomainList(formData.domain);
			if (attempted.length === 0) {
				form.setError('domain', { type: 'server', message: DOMAIN_REQUIRED_MESSAGE });
				return;
			}
			if (attempted.length > MAX_DOMAINS_PER_SUBMIT) {
				form.setError('domain', {
					type: 'server',
					message: `That is ${attempted.length} domains. Add at most ${MAX_DOMAINS_PER_SUBMIT} at a time.`,
				});
				return;
			}
			const before = organizationDomains && domainNameCounts(organizationDomains);
			const { added, failures } = await addDomainsSequentially(
				attempted,
				(domain) => addDomain({ ...formData, domain }),
			);

			// Only refetch when it can change something: a newly created domain has to reach the
			// table, and an indeterminate failure needs the list to arbitrate. A submit that only
			// hit determinate rejections changed nothing, and waiting on the retry backoff would
			// just delay the inline message and keep the form locked.
			// `onlineManager`, not `navigator.onLine`: it is the signal React Query itself gates on, so
			// this is exactly the condition under which the refetch would pause rather than answer.
			// Asking anyway would burn the whole reconcile window before the inline message appears. A
			// client timeout is a different thing — the server was reached and may have committed — so
			// that still reconciles.
			const needsList = onlineManager.isOnline()
				&& (added.length > 0 || failures.some(({ error, attempted: sent }) => sent && isIndeterminate(error)));
			const refreshed = needsList ? await withinReconcileWindow(refetch()) : undefined;
			const created = refreshed ? namesCreated(before, domainNameCounts(refreshed.data)) : new Set<string>();
			const unresolved = unresolvedFailures(failures, created);
			const landed = added.length + failures.length - unresolved.length;

			if (landed > 0) {
				toast.success(
					`${pluralize(landed, 'Domain', 'Domains')} added! Please add the txt record above to your domain registrar.`,
				);
			}

			if (unresolved.length === 0) {
				form.reset();
				return;
			}

			form.setValue('domain', unresolved.map(({ domain }) => domain).join(', '));
			form.setError('domain', { type: 'server', message: describeDomainFailures(unresolved) });
		},
		[addDomain, form, organizationDomains, refetch],
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

	const dataTableColumns = useDataTableColumns(cluster, selectedDomainIds, onToggleDomainSelection, onUnbindClick);

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
			<div className="w-full flex flex-col gap-2">
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
												<Input
													type="text"
													enterKeyHint="done"
													autoComplete="off"
													disabled={formLocked}
													{...field}
												/>
											</FormControl>
											{isApex && (
												<div className="mt-1 flex gap-4">
													Adding an apex domain?
													<Button
														variant="positiveOutline"
														type="button"
														disabled={formLocked}
														onClick={suggestWww}
													>
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
										disabled={formLocked}
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

					{domainIdsToBind.length > 0 && (
						<div className="flex-0 self-start md:pt-6.5">
							<Button
								variant="submit"
								onClick={onBindClick}
								disabled={settingDomainIds || deletingDomain}
							>
								<Save /> Bind {pluralize(domainIdsToBind.length, 'Domain', 'Domains')}
							</Button>
						</div>
					)}
				</div>
				<SubmitErrorMessage message={domainChangeFailure?.message} suggestSupport={domainChangeFailure?.needsSupport} />
			</div>
		</SimpleBrowseDataTable>
	);
}
