import { Loading } from '@/components/Loading';
import { SimpleBrowseDataTable } from '@/components/SimpleBrowseDataTable';
import { SubNavMenu } from '@/components/SubNavMenu';
import { Button } from '@/components/ui/button';
import { OrgPageLayout } from '@/features/organization/components/OrgPageLayout';
import { getOrganizationRolesQueryOptions } from '@/features/organization/queries/getOrganizationRoles';
import { dataTableColumns } from '@/features/organization/users/constants/tableDefinition';
import { AddUserModal } from '@/features/organization/users/modals/AddUserModal';
import { EditUserModal } from '@/features/organization/users/modals/EditUserModal';
import { isAdminRoleName } from '@/features/organization/users/orgUserRemovalPolicy';
import { useOrganizationRolePermissions } from '@/hooks/usePermissions';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { SchemaUser } from '@/integrations/api/api.gen';
import { sortByEmail } from '@/lib/arrays/sort/byEmail';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { Row } from '@tanstack/react-table';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import { Suspense, useCallback, useMemo, useState } from 'react';

export function OrgConfigUsersIndex() {
	const navigate = useNavigate();
	const { organizationId, orgUserId }: { organizationId: string; orgUserId?: string } = useParams({ strict: false });
	const { update } = useOrganizationRolePermissions(organizationId);
	const {
		data: organizationRoles,
		refetch,
		isFetching,
		isRefetching,
	} = useSuspenseQuery(getOrganizationRolesQueryOptions(organizationId));
	const cloudUsers = useMemo(() => {
		const users: Record<SchemaUser['id'], SchemaUser> = {};
		for (const organizationRole of organizationRoles) {
			if (organizationRole.users) {
				for (const user of organizationRole.users) {
					if (!users[user.id]) {
						users[user.id] = { ...user, roles: [] };
					}
					users[user.id].roles!.push(organizationRole);
				}
			}
		}
		return Object.values(users).sort(sortByEmail);
	}, [organizationRoles]);

	// Distinct members holding an admin role — used to keep the last admin from removing their own
	// admin role or leaving (which would leave the org with no one able to manage it).
	const orgAdminCount = useMemo(() => {
		const adminUserIds = new Set<SchemaUser['id']>();
		for (const organizationRole of organizationRoles) {
			if (isAdminRoleName(organizationRole.roleName)) {
				for (const user of organizationRole.users ?? []) {
					adminUserIds.add(user.id);
				}
			}
		}
		return adminUserIds.size;
	}, [organizationRoles]);

	const selectedUser = useMemo(() => cloudUsers?.find((user) => user.id === orgUserId), [cloudUsers, orgUserId]);

	const onSelectUser = useCallback(
		(newUserId: string | undefined) => {
			const parts = [orgUserId ? '..' : '', newUserId].filter(Boolean);
			void navigate({ to: parts.join('/') });
		},
		[orgUserId, navigate],
	);

	const isEditModalOpen = !!orgUserId && !!selectedUser;

	const [isAddModalOpen, setIsAddModalOpen] = useState(false);
	const [sortTableDataParams] = useState({
		attribute: 'email',
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

	const onAddClicked = useCallback(() => {
		setIsAddModalOpen(true);
	}, [setIsAddModalOpen]);
	const onUsedAdded = useCallback(() => {
		void refetch();
		setIsAddModalOpen(false);
	}, [refetch, setIsAddModalOpen]);

	const onRowClick = useCallback(
		(rowData: Row<SchemaUser>) => {
			onSelectUser(rowData.original.id);
		},
		[onSelectUser],
	);
	const closeEditModal = useCallback(() => {
		onSelectUser(undefined);
	}, [onSelectUser]);

	const onUserUpdated = useCallback(() => {
		void refetch();
		onSelectUser(undefined);
	}, [onSelectUser, refetch]);

	const onRefreshClick = useRefreshClick(refetch);

	return (
		<>
			<SubNavMenu />
			<OrgPageLayout>
				<Suspense fallback={<Loading className="flex flex-col items-center justify-center h-full" text="Loading..." />}>
					<SimpleBrowseDataTable<SchemaUser, unknown>
						data={cloudUsers}
						isFetching={isFetching || isRefetching}
						columns={dataTableColumns}
						onRowClick={onRowClick}
						sortingState={sortingState}
					>
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
						{update && (
							<Button variant="positiveOutline" onClick={onAddClicked} accessKey="a" disabled={isAddModalOpen}>
								<PlusIcon />{' '}
								<span>
									<u>A</u>dd
								</span>
							</Button>
						)}
					</SimpleBrowseDataTable>
					{update && (
						<AddUserModal
							isModalOpen={isAddModalOpen}
							onChangesSaved={onUsedAdded}
							setIsModalOpen={setIsAddModalOpen}
						/>
					)}
					{isEditModalOpen && (
						<EditUserModal
							closeModal={closeEditModal}
							data={selectedUser}
							isModalOpen={isEditModalOpen}
							onUserUpdated={onUserUpdated}
							orgUserCount={cloudUsers.length}
							orgAdminCount={orgAdminCount}
						/>
					)}
				</Suspense>
			</OrgPageLayout>
		</>
	);
}
