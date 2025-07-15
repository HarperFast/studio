import { Loading } from '@/components/Loading';
import { Button } from '@/components/ui/button';
import { BrowseDataTable } from '@/features/instance/config/users/components/BrowseDataTable';
import { dataTableColumns } from '@/features/instance/config/users/constants/tableDefinition';
import { AddUserModal } from '@/features/instance/config/users/modals/AddUserModal';
import { EditUserModal } from '@/features/instance/config/users/modals/EditUserModal';
import { getListUsersQueryOptions } from '@/features/instance/operations/queries/getListUsers';
import { LocalUser } from '@/lib/api.patch';
import { sleep } from '@/lib/sleep';
import { useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { Row } from '@tanstack/react-table';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import { Suspense, useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

const route = getRouteApi('');

export function ConfigUsersIndex() {
	const navigate = useNavigate();
	const { instanceId, clusterId, username } = route.useParams();
	const {
		data: localUsers,
		refetch,
		isFetching,
		isRefetching,
	} = useSuspenseQuery(getListUsersQueryOptions(instanceId));
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
		<Suspense
			fallback={<Loading className="flex flex-col items-center justify-center h-full" text="Loading..." />}>
			<BrowseDataTable<LocalUser, unknown>
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
			</BrowseDataTable>
			<AddUserModal
				instanceId={instanceId}
				isModalOpen={isAddModalOpen}
				onChangesSaved={onUsedAdded}
				setIsModalOpen={setIsAddModalOpen}
			/>
			{isEditModalOpen && <EditUserModal
				instanceId={instanceId}
				clusterId={clusterId}
				closeModal={closeEditModal}
				data={selectedUser}
				isModalOpen={isEditModalOpen}
				onUserDeleted={onUserDeleted}
				onUserUpdated={onUserUpdated}
			/>}
		</Suspense>
	);
}
