import { Loading } from '@/components/Loading';
import { SimpleBrowseDataTable } from '@/components/SimpleBrowseDataTable';
import { SubNavMenu } from '@/components/SubNavMenu';
import { Button } from '@/components/ui/button';
import { getOrganizationRolesQueryOptions } from '@/features/organization/queries/getOrganizationRoles';
import { dataTableColumns } from '@/features/organization/roles/constants/tableDefinition';
import { AddOrganizationRoleModal } from '@/features/organization/roles/modals/AddOrganizationRoleModal';
import { EditOrganizationRoleModal } from '@/features/organization/roles/modals/EditOrganizationRoleModal';
import { useOrganizationRolePermissions } from '@/hooks/usePermissions';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { SchemaOrganizationRole } from '@/integrations/api/api.gen';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { Row } from '@tanstack/react-table';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import { Suspense, useCallback, useMemo, useState } from 'react';

export function OrgConfigRolesIndex() {
	const navigate = useNavigate();
	const { organizationId, orgRoleId }: { organizationId: string; orgRoleId?: string } = useParams({ strict: false });
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

	const onRefreshClick = useRefreshClick(refetch);

	return (
		<>
			<SubNavMenu />
			<div className="mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))]">
				<Suspense fallback={<Loading className="flex flex-col items-center justify-center h-full" text="Loading..." />}>
					<SimpleBrowseDataTable data={orgRoles} columns={dataTableColumns} onRowClick={onRowClick}>
						<Button
							variant="defaultOutline"
							onClick={onRefreshClick}
							accessKey="r"
							disabled={isFetching || isRefetching}
						>
							<RefreshCwIcon />
							<span className="hidden lg:inline-block">
								<u>R</u>efresh
							</span>
						</Button>
						{create && (
							<Button variant="positiveOutline" onClick={onAddClicked} accessKey="a" disabled={isAddModalOpen}>
								<PlusIcon />
								<span>
									<u>A</u>dd
								</span>
							</Button>
						)}
					</SimpleBrowseDataTable>
					{create && (
						<AddOrganizationRoleModal
							isModalOpen={isAddModalOpen}
							onChangesSaved={onRoleAdded}
							setIsModalOpen={setIsAddModalOpen}
						/>
					)}
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
		</>
	);
}
