import { Button } from '@/components/ui/button';
import { BrowseDataTable } from '@/features/instance/browse/components/BrowseDataTable';
import { formatBrowseDataTableHeader } from '@/features/instance/browse/functions/formatBrowseDataTableHeader';
import { AddTableRowModal } from '@/features/instance/browse/modals/AddTableRowModal';
import { EditTableRowModal } from '@/features/instance/browse/modals/EditTableRowModal';
import { useDeleteTableRecords } from '@/features/instance/operations/mutations/deleteTableRecords';
import { useInsertTableRecords } from '@/features/instance/operations/mutations/insertTableRecords';
import { useUpdateTableRecords } from '@/features/instance/operations/mutations/updateTableRecords';
import { getDescribeTableQueryOptions } from '@/features/instance/operations/queries/getDescribeTable';
import { getSearchByIdOptions } from '@/features/instance/operations/queries/getSearchById';
import { getSearchByValueOptions } from '@/features/instance/operations/queries/getSearchByValue';
import { useEffectedState } from '@/hooks/useEffectedState';
import { useInstanceSchemaTablePermission } from '@/hooks/usePermissions';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { PaginationState, Row } from '@tanstack/react-table';
import { PlusIcon, RefreshCwIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

const route = getRouteApi('');

export function BrowseDataTableView() {
	const allParams = route.useParams();
	const { clusterId, instanceId, schemaName, tableName } = allParams;

	const canAddRecords = useInstanceSchemaTablePermission(instanceId || clusterId, schemaName, tableName, 'insert');
	const canEditRecords = useInstanceSchemaTablePermission(instanceId || clusterId, schemaName, tableName, 'update');
	const canDeleteRecords = useInstanceSchemaTablePermission(instanceId || clusterId, schemaName, tableName, 'delete');

	const { data: describeTableData, refetch: refetchDescribeTableQueryOptions } = useSuspenseQuery(
		getDescribeTableQueryOptions({
			instanceOrClusterId: instanceId ?? clusterId,
			schemaName,
			tableName,
		}),
	);
	const [selectedIds, setSelectedIds] = useEffectedState<null | unknown[]>(null, allParams);
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);

	const { data: searchByIdData } = useQuery(
		getSearchByIdOptions(isEditModalOpen, instanceId, schemaName, tableName, selectedIds),
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
			instanceId,
			schemaName,
			tableName,
			searchAttribute: hashAttribute,
			sortTableDataParams,
			pagination,
		}),
	);
	const { mutate: addTableRecords, isPending: isAddTableRecordsPending } = useInsertTableRecords();
	const { mutate: updateTableRecords, isPending: isUpdateTableRecordsPending } = useUpdateTableRecords();
	const { mutate: deleteTableRecords, isPending: isDeleteTableRecordsPending } = useDeleteTableRecords();

	useEffect(() => {
		setTotalRecords(describeTableData.record_count);
		setTotalPages(Math.ceil(describeTableData.record_count / pagination.pageSize));
	}, [describeTableData, pagination.pageSize, pagination.pageIndex]);

	const onRecordAdd = (data: Record<string, unknown>[] | Record<string, unknown>) => {
		addTableRecords(
			{
				databaseName: schemaName,
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
				databaseName: schemaName,
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
				databaseName: schemaName,
				tableName,
				hash_values: hashes,
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
	const onRefreshClick = useCallback(() => {
		void refetchSearchByValueOptions?.();
	}, [refetchSearchByValueOptions]);

	const onAddClicked = useCallback(() => {
		setIsAddModalOpen(true);
	}, [setIsAddModalOpen]);

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
				{/*canAddRecords && (<UploadCSVModal />)*/}
				<Button variant="defaultOutline" onClick={onRefreshClick} disabled={tableDataFetching}>
					<RefreshCwIcon />
				</Button>
				{/*<Button variant="defaultOutline" onClick={notYetImplemented}><SearchIcon /></Button>*/}
				{canAddRecords && (
					<Button
						variant="positiveOutline"
						onClick={onAddClicked}
						disabled={isAddModalOpen || isAddTableRecordsPending}
					>
						<PlusIcon />
					</Button>
				)}
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
		</>
	);
}
