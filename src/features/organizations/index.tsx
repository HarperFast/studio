import { ConfirmDeletionModal } from '@/components/ConfirmDeletionModal';
import { SubNavMenu } from '@/components/SubNavMenu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getCurrentUserQueryOptions } from '@/features/auth/queries/getCurrentUser';
import { OrgCard } from '@/features/organizations/components/OrgCard';
import { useDeleteOrganizationMutation } from '@/features/organizations/mutations/deleteOrganization';
import { NewOrg } from '@/features/organizations/NewOrg';
import { curryFilterByFuzzySearch } from '@/lib/string/filterByFuzzySearch';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { PlusIcon } from 'lucide-react';
import { FormEvent, useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

export function OrganizationsIndex() {
	const queryClient = useQueryClient();
	const { data: user } = useSuspenseQuery(getCurrentUserQueryOptions());
	const { mutate: deleteOrg, isPending: isDeletingOrgPending } = useDeleteOrganizationMutation();

	const [isDeleteOrgModalOpen, setIsDeleteOrgModalOpen] = useState(false);
	const [deleteOrgInfo, setDeleteOrgInfo] = useState<null | {
		organizationId: string;
		organizationName?: string;
	}>(null);
	const [filterByNameValue, setFilterByNameValue] = useState('');

	const organizationRoles = useMemo(() => {
		const roles = user?.roles || {};
		const organizations = Object.values(roles);
		const organizationIds = Object.keys(roles).map((organizationId, index) => ({
			organizationId,
			organizationName: organizations[index].organizationName,
			roleName: organizations[index].role,
		}));
		return (
			organizationIds
				.filter(curryFilterByFuzzySearch(['organizationId', 'organizationName'], filterByNameValue))
				.sort((a, b) => ((a.organizationName || '') > (b.organizationName || '') ? 1 : -1)) || []
		);
	}, [filterByNameValue, user?.roles]);

	const onFilterByNameChanged = useCallback((e: FormEvent<HTMLInputElement>) => {
		setFilterByNameValue(e.currentTarget.value?.toLowerCase() || '');
	}, []);

	const handleDeleteOrg = useCallback(
		(org: { organizationId: string; organizationName?: string }) => {
			if (org?.organizationId) {
				deleteOrg(org.organizationId, {
					onSuccess: () => {
						toast.success('Success', {
							description: `Organization successfully deleted.`,
							duration: 5000,
							action: {
								label: 'Dismiss',
								onClick: () => toast.dismiss(),
							},
						});
						void queryClient.invalidateQueries({ refetchType: 'none' });
						setIsDeleteOrgModalOpen(false);
					},
					onError: () => setIsDeleteOrgModalOpen(false),
				});
			}
		},
		[deleteOrg, queryClient, setIsDeleteOrgModalOpen],
	);

	const onDeleteOrgModal = useCallback((orgRole: { organizationId: string; organizationName?: string }) => {
		setDeleteOrgInfo(orgRole);
		setIsDeleteOrgModalOpen(true);
	}, []);

	if (!organizationRoles.length) {
		return <NewOrg />;
	}

	return (
		<>
			<SubNavMenu>
				<div className="flex w-full justify-end gap-2">
					<Input
						placeholder="Filter by name"
						className="inline-block w-48 md:w-64 bg-black border"
						onChange={onFilterByNameChanged}
					/>
					<Link to="/new-org">
						<Button variant="positive" className="rounded-full w-44" accessKey="n">
							<PlusIcon /> <span><u>N</u>ew Organization</span>
						</Button>
					</Link>
				</div>
			</SubNavMenu>
			<section className="mt-40 md:mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))]">
				<div className="grid grid-cols-1 gap-4 md:grid-cols-12">
					{organizationRoles.map((organizationRole) => (
						<div
							key={organizationRole.organizationId}
							className="cols-span-1 md:col-span-4 lg:col-span-3 2xl:col-span-2"
						>
							<OrgCard organizationRole={organizationRole} onDeleteOrgModal={onDeleteOrgModal} />
						</div>
					))}
				</div>
			</section>
			{deleteOrgInfo && (
				<ConfirmDeletionModal
					typeOfThingBeingDeleted="organization"
					nameOfThingBeingDeleted={deleteOrgInfo.organizationName}
					isModalOpen={isDeleteOrgModalOpen}
					setIsModalOpen={() => setIsDeleteOrgModalOpen(false)}
					deletionConfirmed={() => handleDeleteOrg(deleteOrgInfo)}
					deletionPending={isDeletingOrgPending}
				/>
			)}
		</>
	);
}
