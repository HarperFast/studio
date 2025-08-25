import { Loading } from '@/components/Loading';
import { SimpleBrowseDataTable } from '@/components/SimpleBrowseDataTable';
import { SubNavMenu } from '@/components/SubNavMenu';
import { Button } from '@/components/ui/button';
import { getOrganizationRolesQueryOptions } from '@/features/organization/queries/getOrganizationRoles';
import { dataTableColumns } from '@/features/organization/users/constants/tableDefinition';
import { AddUserModal } from '@/features/organization/users/modals/AddUserModal';
import { EditUserModal } from '@/features/organization/users/modals/EditUserModal';
import { useOrganizationRolePermissions } from '@/hooks/usePermissions';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { SchemaUser } from '@/lib/api.gen';
import { sortByEmail } from '@/lib/arrays/sort/byEmail';
import { useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { Row } from '@tanstack/react-table';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import { Suspense, useCallback, useMemo, useState } from 'react';

const route = getRouteApi('');

export function OrgConfigUsersIndex() {
	const navigate = useNavigate();
	const { organizationId, orgUserId }: { organizationId: string; orgUserId?: string } = route.useParams();
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

	const selectedUser = useMemo(() => cloudUsers?.find((user) => user.id === orgUserId), [cloudUsers, orgUserId]);

	const onSelectUser = useCallback(
		(newUserId: string | undefined) => {
			const parts = [orgUserId ? '..' : '', newUserId].filter(Boolean);
			void navigate({ to: parts.join('/') });
		},
		[orgUserId, navigate]
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
		[sortTableDataParams]
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
		[onSelectUser]
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
			<div className="mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-theme(spacing.32))]">
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
						/>
					)}
				</Suspense>
			</div>
		</>
	);
}
