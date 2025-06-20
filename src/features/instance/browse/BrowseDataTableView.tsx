import { useEffect, useState } from 'react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { toast } from 'sonner';
import { getDescribeTableQueryOptions } from '@/features/instance/operations/queries/getDescribeTable';
import { getSearchByValueOptions } from '@/features/instance/operations/queries/getSearchByValue';
import { BrowseDataTable } from '@/features/instance/browse/components/BrowseDataTable';
import { EditTableRowModal } from '@/features/instance/modals/EditTableRowModal';
import { getSearchByHashOptions } from '@/features/instance/operations/queries/getSearchByHash';
import { formatBrowseDataTableHeader } from '@/features/instance/browse/functions/formatBrowseDataTableHeader';
import { PaginationState } from '@tanstack/react-table';
import { useUpdateTableRecords } from '@/features/instance/operations/mutations/updateTableRecords';
import { useDeleteTableRecords } from '@/features/instance/operations/mutations/deleteTableRecords';
import { UploadCSVModal } from '@/features/instance/modals/UploadCSVModal';

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
	});

	const { data: searchByHashData, refetch: refetchSearchByHash } = useQuery(getSearchByHashOptions(searchByHashParams));

	const { dataTableColumns, hash_attribute } = formatBrowseDataTableHeader(describeTableData);
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	const [sortTableDataParams, setSortTableDataParams] = useState({
		attribute: '',
		descending: false,
	});
	const [totalRecords, setTotalRecords] = useState(describeTableData.record_count);
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize: 20,
	});
	const [totalPages, setTotalPages] = useState(Math.ceil(describeTableData.record_count / pagination.pageSize));

	const { data: tableData, refetch: refetchSearchByValueOptions } = useSuspenseQuery(
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

	const onRecordUpdate = async (data: object[]) => {
		updateTableRecords(
			{
				databaseName: schemaName,
				tableName,
				records: data,
			},
			{
				onSuccess: () => {
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
					refetchSearchByValueOptions();
					setIsEditModalOpen(false);
					toast.success('Record deleted successfully');
				},
			}
		);
	};

	// TODO: fix this. It reloads the table several times unnecessarily
	useEffect(() => {
		refetchDescribeTableQueryOptions();
		refetchSearchByValueOptions();
		setTotalRecords(describeTableData.record_count);
		setTotalPages(Math.ceil(describeTableData.record_count / pagination.pageSize));
	}, [
		refetchDescribeTableQueryOptions,
		refetchSearchByValueOptions,
		instanceId,
		schemaName,
		tableName,
		pagination.pageSize,
		pagination.pageIndex,
		describeTableData.record_count,
	]);

	// @ts-expect-error Row<TData> should be defined but can't grab TData from tanstack/react-table
	const onRowClick = async (rowData) => {
		await setSearchByHashParams({
			instanceId,
			schemaName,
			tableName,
			hashAttribute: rowData.original[`${hash_attribute}`],
		});
		refetchSearchByHash();
		setIsEditModalOpen(!isEditModalOpen);
	};

	const onColumnClick = async (accessorKey: string, isDescending: boolean) => {
		await setSortTableDataParams({
			attribute: accessorKey,
			descending: isDescending,
		});
		refetchSearchByValueOptions();
	};

	return (
		<>
			<div>
				<UploadCSVModal />
			</div>
			<BrowseDataTable
				data={tableData.data}
				columns={dataTableColumns}
				onRowClick={onRowClick}
				onColumnClick={onColumnClick}
				totalPages={totalPages}
				totalRecords={totalRecords}
				paginationState={pagination}
				setPagination={setPagination}
			/>
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
