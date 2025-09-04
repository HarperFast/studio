import { ConfirmDeletionModal } from '@/components/ConfirmDeletionModal';
import { Button } from '@/components/ui/button';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { BrowseDataTable } from '@/features/instance/databases/components/BrowseDataTable';
import { formatBrowseDataTableHeader } from '@/features/instance/databases/functions/formatBrowseDataTableHeader';
import { AddTableRowModal } from '@/features/instance/databases/modals/AddTableRowModal';
import { EditTableRowModal } from '@/features/instance/databases/modals/EditTableRowModal';
import { useDeleteTableMutation } from '@/features/instance/operations/mutations/deleteTable';
import { useDeleteTableRecords } from '@/features/instance/operations/mutations/deleteTableRecords';
import { useInsertTableRecords } from '@/features/instance/operations/mutations/insertTableRecords';
import { useUpdateTableRecords } from '@/features/instance/operations/mutations/updateTableRecords';
import { getDescribeTableQueryOptions } from '@/features/instance/operations/queries/getDescribeTable';
import { getSearchByIdOptions } from '@/features/instance/operations/queries/getSearchById';
import { getSearchByValueOptions } from '@/features/instance/operations/queries/getSearchByValue';
import { useEffectedState } from '@/hooks/useEffectedState';
import { useInstanceBrowseManagePermission, useInstanceSchemaTablePermission } from '@/hooks/usePermissions';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { queryClient } from '@/react-query/queryClient';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { PaginationState, Row } from '@tanstack/react-table';
import { PlusIcon, RefreshCwIcon, Trash } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

const route = getRouteApi('');

export function BrowseDataTableView() {
	const allParams: {
		clusterId?: string;
		instanceId?: string;
		databaseName: string;
		tableName: string;
	} = route.useParams();

	const navigate = useNavigate();
	const instanceParams = useInstanceClientIdParams();
	const { clusterId, instanceId, databaseName, tableName } = allParams;

	const canAddRecords = useInstanceSchemaTablePermission(instanceId ?? clusterId, databaseName, tableName, 'insert');
	const canEditRecords = useInstanceSchemaTablePermission(instanceId ?? clusterId, databaseName, tableName, 'update');
	const canDeleteRecords = useInstanceSchemaTablePermission(instanceId ?? clusterId, databaseName, tableName, 'delete');
	const canManageBrowseInstance = useInstanceBrowseManagePermission();

	const { data: describeTableData, refetch: refetchDescribeTableQueryOptions } = useSuspenseQuery(
		getDescribeTableQueryOptions({
			...instanceParams,
			databaseName,
			tableName,
		}),
	);
	const [selectedIds, setSelectedIds] = useEffectedState<null | unknown[]>(null, allParams);
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);

	const { data: searchByIdData } = useQuery(
		getSearchByIdOptions({
			...instanceParams,
			isEditModalOpen: isEditModalOpen,
			databaseName: databaseName,
			tableName: tableName,
			ids: selectedIds,
		}),
	);

	const { dataTableColumns, hashAttribute } = formatBrowseDataTableHeader(describeTableData);
	const [isAddModalOpen, setIsAddModalOpen] = useState(false);
	const [sortTableDataParams, setSortTableDataParams] = useEffectedState({
		attribute: hashAttribute,
		descending: false,
	}, allParams);

	const sortingState = useMemo(
		() => [
			{
				desc: sortTableDataParams.descending,
				id: sortTableDataParams.attribute,
			},
		],
		[sortTableDataParams],
	);

	const [totalRecords, setTotalRecords] = useState(describeTableData.record_count);
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 20,
	});
	const [totalPages, setTotalPages] = useState(Math.ceil(describeTableData.record_count / pagination.pageSize));

	const {
		data: tableData,
		refetch: refetchSearchByValueOptions,
		isFetching: tableDataFetching,
	} = useQuery(
		getSearchByValueOptions({
			...instanceParams,
			databaseName,
			tableName,
			searchAttribute: hashAttribute,
			sortTableDataParams,
			pagination,
		}),
	);
	const { mutate: addTableRecords, isPending: isAddTableRecordsPending } = useInsertTableRecords();
	const { mutate: updateTableRecords, isPending: isUpdateTableRecordsPending } = useUpdateTableRecords();
	const { mutate: deleteTableRecords, isPending: isDeleteTableRecordsPending } = useDeleteTableRecords();
	const { mutate: deleteTable, isPending: isDeletingTable } = useDeleteTableMutation();

	useEffect(() => {
		setTotalRecords(describeTableData.record_count);
		setTotalPages(Math.ceil(describeTableData.record_count / pagination.pageSize));
	}, [describeTableData, pagination.pageSize, pagination.pageIndex]);

	const onRecordAdd = (data: Record<string, unknown>[] | Record<string, unknown>) => {
		addTableRecords(
			{
				...instanceParams,
				databaseName,
				tableName,
				records: Array.isArray(data) ? data : [data],
			},
			{
				onSuccess: () => {
					void refetchDescribeTableQueryOptions();
					void refetchSearchByValueOptions();
					setIsAddModalOpen(false);
					toast.success('Record added successfully');
				},
			},
		);
	};
	const onRecordUpdate = (data: Record<string, unknown>[]) => {
		updateTableRecords(
			{
				...instanceParams,
				databaseName,
				tableName,
				records: data,
			},
			{
				onSuccess: () => {
					void refetchDescribeTableQueryOptions();
					void refetchSearchByValueOptions();
					setIsEditModalOpen(false);
					toast.success('Record updated successfully');
				},
			},
		);
	};
	const onDeleteRecord = (hashes: unknown[]) => {
		deleteTableRecords(
			{
				...instanceParams,
				databaseName,
				tableName,
				hashValues: hashes,
			},
			{
				onSuccess: () => {
					void refetchDescribeTableQueryOptions();
					void refetchSearchByValueOptions();
					setIsEditModalOpen(false);
					toast.success('Record deleted successfully');
				},
			},
		);
	};
	const onRowClick = (rowData: Row<Record<string, unknown>>) => {
		setSelectedIds([rowData.original[hashAttribute]]);
		setIsEditModalOpen(!isEditModalOpen);
	};
	const onColumnClick = (accessorKey: string, isAscending: boolean) => {
		setSortTableDataParams({
			attribute: accessorKey,
			descending: !isAscending,
		});
	};
	const onRefreshClick = useRefreshClick(refetchSearchByValueOptions);

	const onAddClicked = useCallback(() => {
		setIsAddModalOpen(true);
	}, [setIsAddModalOpen]);

	const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

	const onDeleteTable = useCallback((targetDatabaseName: string, targetTableName: string) => {
		deleteTable({
			databaseName: targetDatabaseName,
			tableName: targetTableName,
			...instanceParams,
			replicated: instanceParams.entityType === 'cluster',
		}, {
			onSuccess: async () => {
				setIsDeleteModalOpen(false);
				await queryClient.invalidateQueries({
					queryKey: [instanceParams.entityId, 'describe_all'],
					refetchType: 'all',
				});
				toast.success(`Table ${targetTableName} deleted successfully`);
				if (targetTableName === tableName) {
					void navigate({ to: '../' });
				}
			},
		});
	}, [deleteTable, instanceParams, navigate, tableName]);

	const onDeletionConfirmed = useCallback(() => {
		if (databaseName && tableName) {
			onDeleteTable(databaseName, tableName);
		}
	}, [databaseName, onDeleteTable, tableName]);

	return (
		<>
			<BrowseDataTable<Record<string, unknown>, unknown>
				data={tableData?.data || []}
				isFetching={tableDataFetching}
				columns={dataTableColumns}
				onRowClick={onRowClick}
				onColumnClick={onColumnClick}
				totalPages={totalPages}
				totalRecords={totalRecords}
				paginationState={pagination}
				sortingState={sortingState}
				setPagination={setPagination}
			>
				<div className="flex items-center justify-start space-x-2 pt-15 pb-4">
					{canAddRecords && (
						<Button
							variant="positiveOutline"
							onClick={onAddClicked}
							disabled={isAddModalOpen || isAddTableRecordsPending}
							accessKey="n"
						>
							<PlusIcon />
							<span>
								Add <u>N</u>ew Record(s)
							</span>
						</Button>
					)}
					<Button variant="defaultOutline" onClick={onRefreshClick} disabled={tableDataFetching}>
						<RefreshCwIcon />
					</Button>

					<div className="grow"></div>

					{canManageBrowseInstance && (<Button
						variant="destructiveOutline"
						onClick={() => setIsDeleteModalOpen(true)}
					>
						<Trash className="inline-block " />
						Drop Table
					</Button>)}
				</div>
			</BrowseDataTable>
			{canAddRecords && (
				<AddTableRowModal
					instanceTable={describeTableData}
					setIsModalOpen={setIsAddModalOpen}
					isModalOpen={isAddModalOpen}
					onSaveChanges={onRecordAdd}
					isAddTableRecordsPending={isAddTableRecordsPending}
				/>
			)}
			<EditTableRowModal
				canEditRecords={canEditRecords}
				canDeleteRecords={canDeleteRecords}
				setIsModalOpen={setIsEditModalOpen}
				isModalOpen={isEditModalOpen}
				hashAttribute={hashAttribute}
				data={searchByIdData?.data}
				onSaveChanges={onRecordUpdate}
				onDeleteRecord={onDeleteRecord}
				isUpdateTableRecordsPending={isUpdateTableRecordsPending}
				isDeleteTableRecordsPending={isDeleteTableRecordsPending}
			/>
			<ConfirmDeletionModal
				typeOfThingBeingDeleted="table"
				nameOfThingBeingDeleted={tableName}
				isModalOpen={isDeleteModalOpen}
				setIsModalOpen={() => setIsDeleteModalOpen(false)}
				deletionConfirmed={onDeletionConfirmed}
				deletionPending={isDeletingTable}
			/>
		</>
	);
}
