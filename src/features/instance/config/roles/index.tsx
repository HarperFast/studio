import { Loading } from '@/components/Loading';
import { SimpleBrowseDataTable } from '@/components/SimpleBrowseDataTable';
import { Button } from '@/components/ui/button';
import { dataTableColumns } from '@/features/instance/config/roles/constants/tableDefinition';
import { AddRoleModal } from '@/features/instance/config/roles/modals/AddRoleModal';
import { getListRolesQueryOptions } from '@/features/instance/operations/queries/getListRoles';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { LocalRole } from '@/lib/api.patch';
import { useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { Row } from '@tanstack/react-table';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import { Suspense, useCallback, useMemo, useState } from 'react';
import { EditRoleModal } from './modals/EditRoleModal';

const route = getRouteApi('');

export function ConfigRolesIndex() {
	const navigate = useNavigate();
	const { clusterId, instanceId, roleId } = route.useParams();
	const {
		data: localRoles,
		refetch,
		isFetching,
		isRefetching,
	} = useSuspenseQuery(getListRolesQueryOptions(instanceId));

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
	const onRoleAdded = useCallback((roleName: string) => {
		void refetch();
		setIsAddModalOpen(false);
		onSelectRole(roleName);
	}, [onSelectRole, refetch]);

	const onRowClick = useCallback(
		(rowData: Row<LocalRole>) => {
			onSelectRole(rowData.original.role);
		},
		[onSelectRole]
	);
	const closeEditModal = useCallback(() => {
		onSelectRole(undefined);
	}, [onSelectRole]);

	const onRefreshClick = useRefreshClick(refetch);

	return (
		<Suspense fallback={<Loading className="flex flex-col items-center justify-center h-full" text="Loading..." />}>
			<SimpleBrowseDataTable columns={dataTableColumns} data={localRoles} isFetching={isFetching} onRowClick={onRowClick}>
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
			</SimpleBrowseDataTable>
			<AddRoleModal isModalOpen={isAddModalOpen} onChangesSaved={onRoleAdded} setIsModalOpen={setIsAddModalOpen} />
			{isEditModalOpen && (
				<EditRoleModal
					instanceId={instanceId}
					clusterId={clusterId}
					isModalOpen={isEditModalOpen}
					closeModal={closeEditModal}
					data={selectedRole}
					onSelectRole={onSelectRole}
					onChangesSaved={() => refetch()}
				/>
			)}
		</Suspense>
	);
}
