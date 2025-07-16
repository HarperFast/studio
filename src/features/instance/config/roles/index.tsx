import { Loading } from '@/components/Loading';
import { Suspense, useCallback, useMemo, useState } from 'react';
import { getListRolesQueryOptions } from '@/features/instance/operations/queries/getListRoles';
import { useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { BrowseDataTable } from '@/features/instance/config/roles/components/BrowseDataTable';
import { dataTableColumns } from '@/features/instance/config/roles/constants/tableDefinition';
import { EditRoleModal } from './modals/EditRoleModal';
import { LocalRole } from '@/lib/api.patch';
import { Row } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import { toast } from 'sonner';
import { sleep } from '@/lib/sleep';
import { useAlterRole } from '@/features/instance/operations/mutations/alterRole';
import { AddRoleModal } from '@/features/instance/config/roles/modals/AddRoleModal';
import { useDeleteRoleMutation } from '@/features/instance/operations/mutations/deleteRole';

const route = getRouteApi('');

export function ConfigRolesIndex() {
	const navigate = useNavigate();
	const { instanceId, roleId } = route.useParams();
	const {
		data: localRoles,
		refetch,
		isFetching,
		isRefetching,
	} = useSuspenseQuery(getListRolesQueryOptions(instanceId));

	const { mutate: alterRole, isPending: isAlteringRolePending } = useAlterRole();
	const { mutate: dropRole } = useDeleteRoleMutation();

	const selectedRole = useMemo(() => localRoles?.find((role) => role.id === roleId), [localRoles, roleId]);

	const onSelectRole = useCallback(
		(newRole: string | undefined) => {
			const parts = [roleId ? '..' : '', newRole].filter(Boolean);
			void navigate({ to: parts.join('/') });
		},
		[roleId, navigate]
	);

	const isEditModalOpen = !!roleId && !!selectedRole;

	const [isAddModalOpen, setIsAddModalOpen] = useState(false);

	const onAddClicked = useCallback(() => {
		setIsAddModalOpen(true);
	}, [setIsAddModalOpen]);
	const onRoleAdded = useCallback(() => {
		void refetch();
		setIsAddModalOpen(false);
	}, [refetch, setIsAddModalOpen]);

	const onRowClick = useCallback(
		(rowData: Row<LocalRole>) => {
			onSelectRole(rowData.original.role);
		},
		[onSelectRole]
	);
	const closeEditModal = useCallback(() => {
		onSelectRole(undefined);
	}, [onSelectRole]);

	const onRoleUpdated = useCallback(
		(updatedPermissions: string) => {
			if (updatedPermissions && selectedRole) {
				const parsedPermissions = JSON.parse(updatedPermissions);
				alterRole(
					{
						id: selectedRole.id,
						permission: parsedPermissions,
					},
					{
						onSuccess: () => {
							toast.success('Role updated successfully!');
						},
						onError: (error) => {
							toast.error(`Failed to update role: ${error.message}`);
						},
					}
				);
			}
			void refetch();
			onSelectRole(undefined);
		},
		[onSelectRole, refetch, alterRole, selectedRole]
	);

	const onRoleDeleted = useCallback(() => {
		if (selectedRole) {
			dropRole(
				{
					id: selectedRole.id,
				},
				{
					onSuccess: () => {
						toast.success('Role deleted successfully!');
					},
					onError: (error: Error) => {
						toast.error(`Failed to delete role: ${error.message}`);
					},
				}
			);
		}
		void refetch();
		onSelectRole(undefined);
	}, [onSelectRole, refetch, dropRole, selectedRole]);

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
		<Suspense fallback={<Loading className="flex flex-col items-center justify-center h-full" text="Loading..." />}>
			<BrowseDataTable columns={dataTableColumns} data={localRoles} isFetching={isFetching} onRowClick={onRowClick}>
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
			<AddRoleModal isModalOpen={isAddModalOpen} onChangesSaved={onRoleAdded} setIsModalOpen={setIsAddModalOpen} />
			{isEditModalOpen && (
				<EditRoleModal
					isModalOpen={isEditModalOpen}
					closeModal={closeEditModal}
					data={selectedRole}
					onRoleDeleted={onRoleDeleted}
					isPending={isAlteringRolePending}
					onRoleUpdated={onRoleUpdated}
				/>
			)}
		</Suspense>
	);
}
