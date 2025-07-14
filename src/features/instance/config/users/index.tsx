import { Suspense, useCallback, useMemo, useState } from 'react';
import { getRouteApi } from '@tanstack/react-router';
import { LocalUser } from '@/lib/api.patch';
import { dataTableColumns, hashAttribute } from '@/features/instance/config/users/constants/tableDefinition';
import { BrowseDataTable } from '@/features/instance/config/users/components/BrowseDataTable';
import { notYetImplemented } from '@/lib/notYetImplemented';
import { PlusIcon, RefreshCwIcon, SearchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSuspenseQuery } from '@tanstack/react-query';
import { getListUsersQueryOptions } from '@/features/instance/operations/queries/getListUsers';
import { Loading } from '@/components/Loading';
import { toast } from 'sonner';
import { sleep } from '@/lib/sleep';
import { AddUserModal } from '@/features/instance/config/users/modals/AddUserModal';

const route = getRouteApi('');

export function ConfigUsersIndex() {
	// const navigate = useNavigate();
	const { instanceId } = route.useParams();
	const {
		data: localUsers,
		refetch,
		isFetching,
		isRefetching,
	} = useSuspenseQuery(getListUsersQueryOptions(instanceId));

	// const onSelectUser = useCallback((newUserId: string | undefined) => {
	// 	const parts = [userId ? '..' : '', newUserId].filter(Boolean);
	// 	void navigate({ to: parts.join('/') });
	// }, [userId, navigate]);

	// const isEditModalOpen = !!userId;

	const [isAddModalOpen, setIsAddModalOpen] = useState(false);
	const [sortTableDataParams, setSortTableDataParams] = useState({
		attribute: hashAttribute,
		descending: false,
	});
	const sortingState = useMemo(() => ([{
		desc: sortTableDataParams.descending,
		id: sortTableDataParams.attribute,
	}]), [sortTableDataParams]);

	// const { mutate: updateUser, isPending: isUpdatePending } = useUpdateUserMutation();
	// const { mutate: deleteUser, isPending: isDeletePending } = useDeleteUserMutation();

	const onUsedAdded = useCallback(() => {
		void refetch();
		setIsAddModalOpen(false);
	}, [refetch, setIsAddModalOpen]);

	// const onRecordUpdate = (data: Record<string, unknown>[]) => {
	// 	updateTableRecords(
	// 		{
	// 			databaseName: schemaName,
	// 			tableName,
	// 			records: data,
	// 		},
	// 		{
	// 			onSuccess: () => {
	// 				void refetchDescribeTableQueryOptions();
	// 				void refetchSearchByValueOptions();
	// 				setIsEditModalOpen(false);
	// 				toast.success('Record updated successfully');
	// 			},
	// 		},
	// 	);
	// };
	// const onDeleteRecord = (data: (string | number)[]) => {
	// 	deleteTableRecords(
	// 		{
	// 			databaseName: schemaName,
	// 			tableName,
	// 			hash_values: data,
	// 		},
	// 		{
	// 			onSuccess: () => {
	// 				void refetchDescribeTableQueryOptions();
	// 				void refetchSearchByValueOptions();
	// 				setIsEditModalOpen(false);
	// 				toast.success('Record deleted successfully');
	// 			},
	// 		},
	// 	);
	// };
	// const onRowClick = (rowData: Row<Record<string, unknown>>) => {
	// 	setSelectedHashAttribute(rowData.original[hash_attribute]);
	// 	setIsEditModalOpen(!isEditModalOpen);
	// };
	const onColumnClick = (accessorKey: string, isAscending: boolean) => {
		setSortTableDataParams({
			attribute: accessorKey,
			descending: !isAscending,
		});
	};
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

	const onAddClicked = useCallback(() => {
		setIsAddModalOpen(true);
	}, [setIsAddModalOpen]);

	return (
		<Suspense
			fallback={<Loading className="flex flex-col items-center justify-center h-full" text="Loading..." />}>
			<BrowseDataTable<LocalUser, unknown>
				data={localUsers}
				isFetching={isFetching || isRefetching}
				columns={dataTableColumns}
				// onRowClick={onRowClick}
				onColumnClick={onColumnClick}
				sortingState={sortingState}
			>
				{/*<UploadCSVModal />*/}
				{/*disabled={tableDataFetching}*/}
				<Button variant="defaultOutline" onClick={onRefreshClick}
						accessKey="r"
						disabled={isFetching || isRefetching}><RefreshCwIcon /> <span
					className="hidden lg:inline-block"><u>R</u>efresh</span></Button>
				<Button variant="defaultOutline" onClick={notYetImplemented}><SearchIcon /> <span
					className="hidden lg:inline-block">Search</span></Button>
				<Button variant="positiveOutline" onClick={onAddClicked} accessKey="a"
						disabled={isAddModalOpen}><PlusIcon /> <span><u>A</u>dd</span></Button>
			</BrowseDataTable>
			<AddUserModal
				setIsModalOpen={setIsAddModalOpen}
				isModalOpen={isAddModalOpen}
				onChangesSaved={onUsedAdded}
			/>
			{/*<EditTableRowModal*/}
			{/*	setIsModalOpen={setIsEditModalOpen}*/}
			{/*	isModalOpen={isEditModalOpen}*/}
			{/*	data={searchByHashData?.data}*/}
			{/*	onSaveChanges={onRecordUpdate}*/}
			{/*	onDeleteRecord={onDeleteRecord}*/}
			{/*	isUpdateTableRecordsPending={isUpdateTableRecordsPending}*/}
			{/*	isDeleteTableRecordsPending={isDeleteTableRecordsPending}*/}
			{/*/>*/}
		</Suspense>
	);
}
