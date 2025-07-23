import { Suspense, useCallback, useMemo, useState } from 'react';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Row } from '@tanstack/react-table';
import { Loading } from '@/components/Loading';
import { getOrganizationRolesQueryOptions } from '@/features/organization/queries/getOrganizationRoles';
import { BrowseDataTable } from '@/features/organization/config/roles/components/BrowseDataTable';
import { dataTableColumns } from './constants/tableDefinition';
import { EditOrganizationRoleModal } from './modals/EditOrganizationRoleModal';
import { OrganizationRole } from '@/lib/api.patch';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sleep } from '@/lib/sleep';
import { toast } from 'sonner';
import { AddOrganizationRoleModal } from './modals/AddOrganizationRoleModal';

const route = getRouteApi('');

export function OrgConfigRolesIndex() {
	const navigate = useNavigate();
	const { organizationId, orgRoleId } = route.useParams();

	const {
		data: orgRoles,
		refetch,
		isFetching,
		isRefetching,
	} = useSuspenseQuery(getOrganizationRolesQueryOptions(organizationId));

	const selectedOrgRole = useMemo(
		() => orgRoles && orgRoles?.find((role) => role.id === orgRoleId),
		[orgRoles, orgRoleId]
	);

	const isEditOrgRoleModalOpen = !!orgRoleId && !!selectedOrgRole;

	const [isAddModalOpen, setIsAddModalOpen] = useState(false);

	const onSelectOrgRole = useCallback(
		(newOrgRole: string | undefined) => {
			const parts = [orgRoleId ? '..' : '', newOrgRole].filter(Boolean);
			void navigate({ to: parts.join('/') });
		},
		[orgRoleId, navigate]
	);

	const onAddClicked = useCallback(() => {
		setIsAddModalOpen(true);
	}, [setIsAddModalOpen]);
	const onRoleAdded = useCallback(() => {
		void refetch();
		setIsAddModalOpen(false);
	}, [refetch, setIsAddModalOpen]);

	const onRowClick = useCallback(
		(rowData: Row<OrganizationRole>) => {
			onSelectOrgRole(rowData.original.id);
		},
		[onSelectOrgRole]
	);

	const closeEditModal = useCallback(() => {
		onSelectOrgRole(undefined);
	}, [onSelectOrgRole]);

	const onRefreshClick = useCallback(async () => {
		const toastId = toast.loading('Refreshing...');
		const startedAt = Date.now();
		await refetch();
		if (Date.now() - startedAt < 500) {
			await sleep(500);
		}
		toast.dismiss(toastId);
		toast.success('Refreshed!');
	}, [refetch]);

	return (
		<div className="mt-20 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))]">
			<Suspense fallback={<Loading className="flex flex-col items-center justify-center h-full" text="Loading..." />}>
				<BrowseDataTable data={orgRoles} columns={dataTableColumns} onRowClick={onRowClick}>
					<Button variant="defaultOutline" onClick={onRefreshClick} accessKey="r" disabled={isFetching || isRefetching}>
						<RefreshCwIcon />
						<span className="hidden lg:inline-block">
							<u>R</u>efresh
						</span>
					</Button>
					<Button variant="positiveOutline" onClick={onAddClicked} accessKey="a" disabled={isAddModalOpen}>
						<PlusIcon />
						<span>
							<u>A</u>dd
						</span>
					</Button>
				</BrowseDataTable>
				<AddOrganizationRoleModal
					isModalOpen={isAddModalOpen}
					onChangesSaved={onRoleAdded}
					setIsModalOpen={setIsAddModalOpen}
				/>
				{isEditOrgRoleModalOpen && (
					<EditOrganizationRoleModal
						data={selectedOrgRole}
						isModalOpen={isEditOrgRoleModalOpen}
						closeModal={closeEditModal}
					/>
				)}
			</Suspense>
		</div>
	);
}
