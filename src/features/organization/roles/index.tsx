import { Loading } from '@/components/Loading';
import { SimpleBrowseDataTable } from '@/components/SimpleBrowseDataTable';
import { SubNavMenu } from '@/components/SubNavMenu';
import { Button } from '@/components/ui/button';
import { getOrganizationRolesQueryOptions } from '@/features/organization/queries/getOrganizationRoles';
import { useOrganizationRolePermissions } from '@/hooks/usePermissions';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { SchemaOrganizationRole } from '@/integrations/api/api.gen';
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { Row } from '@tanstack/react-table';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import { Suspense, useCallback, useMemo, useState } from 'react';
import { dataTableColumns } from './constants/tableDefinition';
import { AddOrganizationRoleModal } from './modals/AddOrganizationRoleModal';
import { EditOrganizationRoleModal } from './modals/EditOrganizationRoleModal';

export function OrgConfigRolesIndex() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();

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
		[orgRoles, orgRoleId],
	);

	const isEditOrgRoleModalOpen = !!orgRoleId && !!selectedOrgRole;

	const [isAddModalOpen, setIsAddModalOpen] = useState(false);

	const onSelectOrgRole = useCallback(
		async (newOrgRole: string | undefined, madeChanges: boolean) => {
			const parts = [orgRoleId ? '..' : '', newOrgRole].filter(Boolean);
			await navigate({ to: parts.join('/') });
			if (madeChanges) {
				await queryClient.invalidateQueries({
					queryKey: [organizationId, 'roles'],
					refetchType: 'active',
				});
			}
		},
		[orgRoleId, navigate, queryClient],
	);

	const onAddClicked = useCallback(() => {
		setIsAddModalOpen(true);
	}, [setIsAddModalOpen]);

	const onRowClick = useCallback(
		(rowData: Row<SchemaOrganizationRole>) => {
			return onSelectOrgRole(rowData.original.id, false);
		},
		[onSelectOrgRole],
	);

	const closeEditModal = useCallback((madeChanges: boolean) => {
		return onSelectOrgRole(undefined, madeChanges);
	}, [onSelectOrgRole]);

	const onRefreshClick = useRefreshClick(refetch);

	return (
		<>
			<SubNavMenu />
			<div className="mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-(--spacing(32)))]">
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
							setIsModalOpen={setIsAddModalOpen}
						/>
					)}
					{isEditOrgRoleModalOpen && (
						<EditOrganizationRoleModal
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
