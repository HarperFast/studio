import { SimpleBrowseDataTable } from '@/components/SimpleBrowseDataTable';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { useDataTableColumns } from '@/features/cluster/domains/constants/tableDefinition';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import {
	AddOrganizationDomainSchema,
	useAddDomainToOrganization,
} from '@/features/organization/mutations/addDomainToOrganization';
import { validateDomainInOrganization } from '@/features/organization/mutations/validateDomainInOrganization';
import { getOrganizationDomainsQueryOptions } from '@/features/organization/queries/getOrganizationDomains';
import { useOrganizationRolePermissions } from '@/hooks/usePermissions';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { SchemaOrganizationDomain } from '@/integrations/api/api.patch';
import { pluralize } from '@/lib/pluralize';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { ListTodoIcon, PlusIcon, RefreshCwIcon } from 'lucide-react';
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

	const { mutate: addDomain, isPending: isAddPending } = useAddDomainToOrganization();
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
				addDomain(formData, {
					onSuccess: () => {
						form.reset();
						refetch();
						toast.success('Domain added! Please add the txt record above to your domain registrar.');
					},
				});
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

	const dataTableColumns = useDataTableColumns(cluster);

	return (
		<SimpleBrowseDataTable<SchemaOrganizationDomain, unknown>
			data={organizationDomains || []}
			isFetching={isFetching || isRefetching}
			columns={dataTableColumns}
			sortingState={sortingState}
		>
			<div className="w-full flex flex-col md:flex-row justify-between md:items-center md:space-x-2 space-y-2 md:space-y-0">
				{update && (
					<Form {...form}>
						<form
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
										<FormMessage>
											<span className="text-muted-foreground italic">
												Type in a domain like example.com or your.example.com, and you'll be guided through validating
												and binding your cluster to it.
											</span>
										</FormMessage>
									</FormItem>
								)}
							/>
							<div className="flex-0 self-start md:pt-6.5">
								<Button
									type="submit"
									variant="submit"
									disabled={isAddPending}
								>
									<PlusIcon /> Add
								</Button>
							</div>
						</form>
					</Form>
				)}

				{pendingDomains.length > 0 && (
					<Button
						variant="positiveOutline"
						onClick={onValidateClick}
						accessKey="r"
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
					disabled={isFetching || isRefetching}
				>
					<RefreshCwIcon />{' '}
					<span className="hidden lg:inline-block">
						<u>R</u>efresh
					</span>
				</Button>
			</div>
		</SimpleBrowseDataTable>
	);
}
