import { ConfirmDeletionModal } from '@/components/ConfirmDeletionModal';
import { Input } from '@/components/ui/input';
import { getCurrentUserQueryOptions } from '@/features/auth/queries/getCurrentUser';
import { OrgCard } from '@/features/organizations/components/OrgCard';
import { NewOrganizationModal } from '@/features/organizations/modals/NewOrganizationModal';
import { useDeleteOrganizationMutation } from '@/features/organizations/mutations/deleteOrganization';
import { OrganizationRole } from '@/lib/api.patch';
import { curryFilterByFuzzySearch } from '@/lib/string/filterByFuzzySearch';
import { queryKeys } from '@/react-query/constants';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { FormEvent, useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

export function OrganizationsIndex() {
	const queryClient = useQueryClient();
	const { data: user } = useSuspenseQuery(getCurrentUserQueryOptions());
	const { mutate: deleteOrg, isPending: isDeletingOrgPending } = useDeleteOrganizationMutation();

	const [isDeleteOrgModalOpen, setIsDeleteOrgModalOpen] = useState(false);
	const [deleteOrgInfo, setDeleteOrgInfo] = useState({
		id: '',
		name: '',
	});
	const [filterByNameValue, setFilterByNameValue] = useState('');

	const organizationRoles = useMemo(
		() =>
			user?.roles
				.slice()
				.filter(curryFilterByFuzzySearch<OrganizationRole>(['organizationId', 'organizationName'], filterByNameValue))
				.sort((a, b) => (a.organizationName || '') > (b.organizationName || '') ? 1 : -1) || [],
		[filterByNameValue, user?.roles],
	);

	const onFilterByNameChanged = useCallback((e: FormEvent<HTMLInputElement>) => {
		setFilterByNameValue(e.currentTarget.value?.toLowerCase() || '');
	}, []);

	const handleDeleteOrg = useCallback((orgInfo: { id: string; name: string }) => {
		if (orgInfo) {
			deleteOrg(orgInfo.id, {
				onSuccess: () => {
					toast.success('Success', {
						description: `Organization successfully deleted.`,
						duration: 5000,
						action: {
							label: 'Dismiss',
							onClick: () => toast.dismiss(),
						},
					});
					queryClient.invalidateQueries({ queryKey: [queryKeys.user], refetchType: 'active' });
					queryClient.invalidateQueries({ queryKey: [queryKeys.organization], refetchType: 'active' });
					setIsDeleteOrgModalOpen(false);
				},
				onError: () => {
					toast.error('Error', {
						description: `Failed to delete organization: ${orgInfo.name}.`,
						duration: 5000,
						action: {
							label: 'Dismiss',
							onClick: () => toast.dismiss(),
						},
					});
					setIsDeleteOrgModalOpen(false);
				},
			});
		}
	}, [deleteOrg, queryClient, setIsDeleteOrgModalOpen]);

	const onDeleteOrgModal = useCallback((orgRole: OrganizationRole) => {
		setDeleteOrgInfo({
			id: orgRole.organizationId,
			name: (orgRole.organizationName || ''),
		});
		setIsDeleteOrgModalOpen(true);
	}, []);

	return (
		<>
			<nav className="fixed top-20 w-full h-12 z-39 px-4 md:px-12 bg-grey-700">
				<div className="flex items-center justify-between h-full text-sm text-white">
					<div className="w-full">
						<Input
							placeholder="Filter organizations by name"
							className="inline-block w-3/5 md:w-64"
							onChange={onFilterByNameChanged}
						/>
						{/*<Button className="inline-block w-2/5 md:w-auto md:ml-4" onClick={notYetImplemented}>*/}
						{/*	Sort by A-Z*/}
						{/*	<span>*/}
						{/*		<ChevronDown className="inline-block" />*/}
						{/*	</span>*/}
						{/*</Button>*/}
					</div>
					<NewOrganizationModal />
				</div>
			</nav>
			<section className="mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))]">
				<div className="grid grid-cols-1 gap-4 md:grid-cols-12">
					{organizationRoles.map((organizationRole) => (
						<div key={organizationRole.organizationId} className="cols-span-1 md:col-span-4 lg:col-span-3 2xl:col-span-2">
							<OrgCard organizationRole={organizationRole} onDeleteOrgModal={onDeleteOrgModal} />
						</div>
					))}
				</div>
			</section>
			<ConfirmDeletionModal
				typeOfThingBeingDeleted="organization"
				nameOfThingBeingDeleted={deleteOrgInfo.name}
				isModalOpen={isDeleteOrgModalOpen}
				setIsModalOpen={() => setIsDeleteOrgModalOpen(false)}
				deletionConfirmed={() => handleDeleteOrg(deleteOrgInfo)}
				deletionPending={isDeletingOrgPending}
			/>
		</>
	);
}
