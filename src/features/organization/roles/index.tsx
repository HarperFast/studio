import { Loading } from '@/components/Loading';
import { Button } from '@/components/ui/button';
import { getOrganizationRolesQueryOptions } from '@/features/organization/queries/getOrganizationRoles';
import { BrowseDataTable } from '@/features/organization/roles/components/BrowseDataTable';
import { useOrganizationRolePermissions } from '@/hooks/usePermissions';
import { SchemaOrganizationRole } from '@/lib/api.gen';
import { sleep } from '@/lib/sleep';
import { useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { Row } from '@tanstack/react-table';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import { Suspense, useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { dataTableColumns } from './constants/tableDefinition';
import { AddOrganizationRoleModal } from './modals/AddOrganizationRoleModal';
import { EditOrganizationRoleModal } from './modals/EditOrganizationRoleModal';

const route = getRouteApi('');

export function OrgConfigRolesIndex() {
	const navigate = useNavigate();
	const { organizationId, orgRoleId } = route.useParams();
	const { create } = useOrganizationRolePermissions(organizationId);

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

	const onRoleDeleted = useCallback(() => {
		void refetch();
		setIsAddModalOpen(false);
	}, [refetch, setIsAddModalOpen]);

	const onAddClicked = useCallback(() => {
		setIsAddModalOpen(true);
	}, [setIsAddModalOpen]);
	const onRoleAdded = useCallback(() => {
		void refetch();
		setIsAddModalOpen(false);
	}, [refetch, setIsAddModalOpen]);

	const onRowClick = useCallback(
		(rowData: Row<SchemaOrganizationRole>) => {
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
					{create && (<Button variant="positiveOutline" onClick={onAddClicked} accessKey="a" disabled={isAddModalOpen}>
						<PlusIcon />
						<span>
							<u>A</u>dd
						</span>
					</Button>)}
				</BrowseDataTable>
				{create && (<AddOrganizationRoleModal
					isModalOpen={isAddModalOpen}
					onChangesSaved={onRoleAdded}
					setIsModalOpen={setIsAddModalOpen}
				/>)}
				{isEditOrgRoleModalOpen && (
					<EditOrganizationRoleModal
						roleDeleted={onRoleDeleted}
						data={selectedOrgRole}
						isModalOpen={isEditOrgRoleModalOpen}
						closeModal={closeEditModal}
					/>
				)}
			</Suspense>
		</div>
	);
}
