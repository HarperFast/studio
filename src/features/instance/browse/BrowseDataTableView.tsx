import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { toast } from 'sonner';
import { getDescribeTableQueryOptions } from '@/features/instance/operations/queries/getDescribeTable';
import { getSearchByValueOptions } from '@/features/instance/operations/queries/getSearchByValue';
import { BrowseDataTable } from '@/features/instance/browse/components/BrowseDataTable';
import { EditTableRowModal } from '@/features/instance/modals/EditTableRowModal';
import { getSearchByHashOptions } from '@/features/instance/operations/queries/getSearchByHash';
import { formatBrowseDataTableHeader } from '@/features/instance/browse/functions/formatBrowseDataTableHeader';
import { PaginationState, Row } from '@tanstack/react-table';
import { useUpdateTableRecords } from '@/features/instance/operations/mutations/updateTableRecords';
import { useDeleteTableRecords } from '@/features/instance/operations/mutations/deleteTableRecords';
import { UploadCSVModal } from '@/features/instance/modals/UploadCSVModal';
import { Button } from '@/components/ui/button.tsx';
import { PlusIcon, RefreshCwIcon, SearchIcon } from 'lucide-react';
import { notYetImplemented } from '@/lib/not-yet-implemented.ts';

// TODO: Define on describe table data call
// type AttributesTypes = {
// 	attribute: string;
// 	is_primary_key: boolean;
// 	type: string;
// 	indexed: boolean;
// 	elements: string;
// };

// type DataTableState = {
// 	dataTableColumns: ColumnDef<string[]>[];
// 	tableData: string[][];
// 	dynamicAttributesFromDataTable: string[];
// 	hashAttribute: string;
// 	page: number;
// 	pageSize: number;
// 	schemaAttributes: AttributesTypes[];
// };

const route = getRouteApi('');

export function BrowseDataTableView() {
	const { instanceId, schemaName, tableName } = route.useParams();

	const { data: describeTableData, refetch: refetchDescribeTableQueryOptions } = useSuspenseQuery(
		getDescribeTableQueryOptions({
			instanceId,
			schemaName,
			tableName,
		})
	);

	const [searchByHashParams, setSearchByHashParams] = useState({
		instanceId,
		schemaName,
		tableName,
		hashAttribute: [''],
		refetch: false,
	});

	const { data: searchByHashData, refetch: refetchSearchByHash } = useQuery(getSearchByHashOptions(searchByHashParams));

	const { dataTableColumns, hash_attribute } = formatBrowseDataTableHeader(describeTableData);
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [sortTableDataParams, setSortTableDataParams] = useState({
		attribute: hash_attribute,
		descending: false,
		refetch: false,
	});
	const sortingState = useMemo(() => ([{
		desc: sortTableDataParams.descending,
		id: sortTableDataParams.attribute,
	}]), [sortTableDataParams]);

	const [totalRecords, setTotalRecords] = useState(describeTableData.record_count);
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 20,
	});
	const [totalPages, setTotalPages] = useState(Math.ceil(describeTableData.record_count / pagination.pageSize));

	const { data: tableData, refetch: refetchSearchByValueOptions, isFetching } = useSuspenseQuery(
		getSearchByValueOptions({
			instanceId,
			schemaName,
			tableName,
			hash_attribute,
			sortTableDataParams,
			pagination,
		})
	);
	const { mutate: updateTableRecords, isPending: isUpdateTableRecordsPending } = useUpdateTableRecords();
	const { mutate: deleteTableRecords, isPending: isDeleteTableRecordsPending } = useDeleteTableRecords();

	useEffect(() => {
		if (searchByHashParams.refetch) {
			void refetchSearchByHash();
			setSearchByHashParams({ ...searchByHashParams, refetch: false });
		}
	}, [searchByHashParams, refetchSearchByHash, setSearchByHashParams]);
	useEffect(() => {
		if (sortTableDataParams.refetch) {
			void refetchSearchByValueOptions();
			setSortTableDataParams({ ...sortTableDataParams, refetch: false });
		}
	}, [sortTableDataParams, setSortTableDataParams, refetchSearchByValueOptions]);

	const onRecordUpdate = async (data: Record<string, unknown>[]) => {
		updateTableRecords(
			{
				databaseName: schemaName,
				tableName,
				records: data,
			},
			{
				onSuccess: () => {
					refetchDescribeTableQueryOptions();
					refetchSearchByValueOptions();
					setIsEditModalOpen(false);
					toast.success('Record updated successfully');
				},
			}
		);
	};

	const onDeleteRecord = async (data: (string | number)[]) => {
		deleteTableRecords(
			{
				databaseName: schemaName,
				tableName,
				hash_values: data,
			},
			{
				onSuccess: () => {
					refetchDescribeTableQueryOptions();
					refetchSearchByValueOptions();
					setIsEditModalOpen(false);
					toast.success('Record deleted successfully');
				},
			}
		);
	};

	useEffect(() => {
		setTotalRecords(describeTableData.record_count);
		setTotalPages(Math.ceil(describeTableData.record_count / pagination.pageSize));
	}, [
		describeTableData,
		pagination.pageSize,
		pagination.pageIndex,
	]);
	useEffect(() => {
		void refetchSearchByValueOptions()
	}, [
		refetchSearchByValueOptions,
		pagination.pageSize,
		pagination.pageIndex,
	]);


	const onRowClick = async (rowData: Row<Record<string, unknown>>) => {
		setSearchByHashParams({
			instanceId,
			schemaName,
			tableName,
			hashAttribute: rowData.original[hash_attribute] as string[],
			refetch: true,
		});
		setIsEditModalOpen(!isEditModalOpen);
	};

	const onColumnClick = async (accessorKey: string, isAscending: boolean) => {
		setSortTableDataParams({
			attribute: accessorKey,
			descending: !isAscending,
			refetch: true,
		});
	};

	const onRefreshClick = useCallback(() => {
		void refetchSearchByValueOptions?.();
	}, [refetchSearchByValueOptions]);

	return (
		<>
			<BrowseDataTable<Record<string, unknown>, unknown>
				data={tableData.data}
				columns={dataTableColumns}
				onRowClick={onRowClick}
				onColumnClick={onColumnClick}
				totalPages={totalPages}
				totalRecords={totalRecords}
				paginationState={pagination}
				sortingState={sortingState}
				setPagination={setPagination}
			>
				<UploadCSVModal />
				<Button variant="defaultOutline" onClick={onRefreshClick}><RefreshCwIcon /></Button>
				<Button variant="defaultOutline" onClick={notYetImplemented}><SearchIcon /></Button>
				<Button variant="positiveOutline" onClick={notYetImplemented} disabled={isFetching}><PlusIcon /></Button>
			</BrowseDataTable>
			<EditTableRowModal
				setIsModalOpen={setIsEditModalOpen}
				isModalOpen={isEditModalOpen}
				data={searchByHashData?.data}
				onSaveChanges={onRecordUpdate}
				onDeleteRecord={onDeleteRecord}
				isUpdateTableRecordsPending={isUpdateTableRecordsPending}
				isDeleteTableRecordsPending={isDeleteTableRecordsPending}
			/>
		</>
	);
}
