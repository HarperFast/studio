import { Loading } from '@/components/Loading';
import { SimpleBrowseDataTable } from '@/components/SimpleBrowseDataTable';
import { Button } from '@/components/ui/button';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { dataTableColumns } from '@/features/instance/config/users/constants/tableDefinition';
import { AddUserModal } from '@/features/instance/config/users/modals/AddUserModal';
import { EditUserModal } from '@/features/instance/config/users/modals/EditUserModal';
import { getListUsersQueryOptions } from '@/features/instance/operations/queries/getListUsers';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { LocalUser } from '@/lib/api.patch';
import { useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { Row } from '@tanstack/react-table';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import { Suspense, useCallback, useMemo, useState } from 'react';

export function ConfigUsersIndex() {
	const navigate = useNavigate();
	const { instanceId, clusterId, username }: {
		instanceId?: string;
		clusterId?: string;
		username?: string;
	} = useParams({ strict: false });
	const instanceParams = useInstanceClientIdParams();
	const {
		data: localUsers,
		refetch,
		isFetching,
		isRefetching,
	} = useSuspenseQuery(getListUsersQueryOptions(instanceParams));
	const selectedUser = useMemo(
		() => localUsers?.find(user => user.username === username),
		[localUsers, username],
	);

	const onSelectUser = useCallback((newUsername: string | undefined) => {
		const parts = [username ? '..' : '', newUsername].filter(Boolean);
		void navigate({ to: parts.join('/') });
	}, [username, navigate]);

	const isEditModalOpen = !!username && !!selectedUser;

	const [isAddModalOpen, setIsAddModalOpen] = useState(false);
	const [sortTableDataParams] = useState({
		attribute: 'username',
		descending: false,
	});
	const sortingState = useMemo(() => ([{
		desc: sortTableDataParams.descending,
		id: sortTableDataParams.attribute,
	}]), [sortTableDataParams]);

	const onAddClicked = useCallback(() => {
		setIsAddModalOpen(true);
	}, [setIsAddModalOpen]);
	const onUsedAdded = useCallback(() => {
		void refetch();
		setIsAddModalOpen(false);
	}, [refetch, setIsAddModalOpen]);

	const onRowClick = useCallback((rowData: Row<LocalUser>) => {
		onSelectUser(rowData.original.username);
	}, [onSelectUser]);
	const closeEditModal = useCallback(() => {
		onSelectUser(undefined);
	}, [onSelectUser]);

	const onUserUpdated = useCallback(() => {
		void refetch();
		onSelectUser(undefined);
	}, [onSelectUser, refetch]);
	const onUserDeleted = useCallback(() => {
		void refetch();
		onSelectUser(undefined);
	}, [onSelectUser, refetch]);

	const onRefreshClick = useRefreshClick(refetch);

	return (
		<Suspense
			fallback={<Loading className="flex flex-col items-center justify-center h-full" text="Loading..." />}>
			<SimpleBrowseDataTable<LocalUser, unknown>
				data={localUsers}
				isFetching={isFetching || isRefetching}
				columns={dataTableColumns}
				onRowClick={onRowClick}
				sortingState={sortingState}
			>
				{/*<UploadCSVModal />*/}
				{/*disabled={tableDataFetching}*/}
				<Button variant="defaultOutline" onClick={onRefreshClick}
						accessKey="r"
						disabled={isFetching || isRefetching}><RefreshCwIcon /> <span
					className="hidden lg:inline-block"><u>R</u>efresh</span></Button>
				{/*<Button variant="defaultOutline" onClick={notYetImplemented}><SearchIcon /> <span*/}
				{/*	className="hidden lg:inline-block">Search</span></Button>*/}
				<Button variant="positiveOutline" onClick={onAddClicked} accessKey="a"
						disabled={isAddModalOpen}><PlusIcon /> <span><u>A</u>dd</span></Button>
			</SimpleBrowseDataTable>
			<AddUserModal
				isModalOpen={isAddModalOpen}
				onChangesSaved={onUsedAdded}
				setIsModalOpen={setIsAddModalOpen}
			/>
			{isEditModalOpen && (<EditUserModal
				instanceId={instanceId}
				clusterId={clusterId}
				closeModal={closeEditModal}
				data={selectedUser}
				isModalOpen={isEditModalOpen}
				onUserDeleted={onUserDeleted}
				onUserUpdated={onUserUpdated}
			/>)}
		</Suspense>
	);
}
