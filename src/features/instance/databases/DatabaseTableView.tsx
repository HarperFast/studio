import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { ColumnFiltersSchema } from '@/features/instance/databases/components/ColumnFilters';
import { PickColumnsDropdown } from '@/features/instance/databases/components/PickColumnsDropdown';
import { TableView } from '@/features/instance/databases/components/TableView';
import { formatBrowseDataTableHeader } from '@/features/instance/databases/functions/formatBrowseDataTableHeader';
import { AddTableRowModal } from '@/features/instance/databases/modals/AddTableRowModal';
import { DeleteDatabaseModal } from '@/features/instance/databases/modals/DeleteDatabaseModal';
import { DeleteTableModal } from '@/features/instance/databases/modals/DeleteTableModal';
import { EditTableRowModal } from '@/features/instance/databases/modals/EditTableRowModal';
import { ImportCSVModal } from '@/features/instance/databases/modals/ImportCSVModal';
import { useDeleteTableRecords } from '@/features/instance/operations/mutations/deleteTableRecords';
import { useInsertTableRecords } from '@/features/instance/operations/mutations/insertTableRecords';
import { useUpdateTableRecords } from '@/features/instance/operations/mutations/updateTableRecords';
import { getDescribeTableQueryOptions } from '@/features/instance/operations/queries/getDescribeTable';
import {
	getSearchByConditionsOptions,
	SearchCondition,
	translateColumnFilterToSearchConditions,
} from '@/features/instance/operations/queries/getSearchByConditions';
import { getSearchByIdOptions } from '@/features/instance/operations/queries/getSearchById';
import { getSearchByValueOptions } from '@/features/instance/operations/queries/getSearchByValue';
import { useEffectedState } from '@/hooks/useEffectedState';
import { useInstanceBrowseManagePermission, useInstanceSchemaTablePermission } from '@/hooks/usePermissions';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import { useToggler } from '@/hooks/useToggler';
import { InstanceDatabaseMap } from '@/lib/api.patch';
import { useSetWatchedValue } from '@/lib/events/watcher';
import { keyBy } from '@/lib/keyBy';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useLoaderData, useNavigate, useParams } from '@tanstack/react-router';
import { Row, VisibilityState } from '@tanstack/react-table';
import {
	EllipsisIcon,
	FunnelIcon,
	FunnelPlusIcon,
	FunnelXIcon,
	ImportIcon,
	PlusIcon,
	RefreshCwIcon,
	Trash2Icon,
	TrashIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

export function DatabaseTableView() {
	const allParams: {
		clusterId?: string;
		instanceId?: string;
		databaseName: string;
		tableName: string;
	} = useParams({ strict: false });

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
	const attributesMap = useMemo(() => keyBy(describeTableData.attributes, 'attribute'), [describeTableData]);
	const [selectedIds, setSelectedIds] = useEffectedState<null | unknown[]>(null, allParams);
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);

	const instanceDatabaseMap = useLoaderData({ strict: false }) as InstanceDatabaseMap;
	const isLastTableInDatabase = useMemo(() => {
		const tableNames = databaseName ? Object.keys(instanceDatabaseMap[databaseName] || []).sort() : [];
		return tableNames?.length === 1;
	}, [instanceDatabaseMap, databaseName]);

	const { toggled: filtersToggled, toggleOn: showFilters, toggleOff: hideFilters } = useToggler(false);
	const columnFiltersForm = useForm({
		resolver: zodResolver(ColumnFiltersSchema),
	});
	const { reset: resetFiltersForm } = columnFiltersForm;
	const columnFiltersValues = columnFiltersForm.watch();

	const [appliedSearchConditions, setAppliedSearchConditions] = useState<SearchCondition[] | null>(null);

	const applyFilters = useCallback(() => {
		const conditions: SearchCondition[] = [];
		for (const key in columnFiltersValues) {
			if (columnFiltersValues[key]?.length) {
				try {
					conditions.push(...translateColumnFilterToSearchConditions(key, columnFiltersValues[key], attributesMap[key]));
				} catch (err) {
					toast.error(String(err));
				}
			}
		}
		setAppliedSearchConditions(conditions.length ? conditions : null);
		resetFiltersForm({ ...columnFiltersValues });
	}, [attributesMap, resetFiltersForm, columnFiltersValues]);
	const clearFilters = useCallback(() => {
		// Note sure why we need to resetFiltersForm twice here...
		resetFiltersForm({}, { keepValues: false, keepDirtyValues: false, keepDefaultValues: false });
		resetFiltersForm();
		setAppliedSearchConditions(null);
		hideFilters();
	}, [hideFilters, resetFiltersForm]);

	const { dataTableColumns, hashAttribute } = formatBrowseDataTableHeader(describeTableData);
	const [isAddModalOpen, setIsAddModalOpen] = useState(false);
	const [isImportCSVModalOpen, setIsImportCSVModalOpen] = useState(false);
	const [sort, setSort] = useEffectedState(
		{
			attribute: hashAttribute,
			descending: false,
		},
		allParams,
	);

	const [totalRecords, setTotalRecords] = useState(describeTableData.record_count);
	const [pageIndex, setPageIndex] = useEffectedState(0, [databaseName, tableName]);
	const [pageSize, setPageSize] = useState(20);
	const [totalPages, setTotalPages] = useState(Math.ceil(describeTableData.record_count / pageSize));

	const useFilteredList = filtersToggled && !!appliedSearchConditions;

	// Full list
	const {
		data: fullTableData,
		refetch: refetchSearchByValueOptions,
		isFetching: tableDataFetching,
	} = useQuery(
		getSearchByValueOptions({
			enabled: !useFilteredList,
			...instanceParams,
			databaseName,
			tableName,
			searchAttribute: hashAttribute,
			sort,
			pageSize,
			pageIndex,
		}),
	);
	// Filtered list
	const { data: filteredTableData } = useQuery(
		getSearchByConditionsOptions({
			enabled: useFilteredList,
			...instanceParams,
			databaseName,
			tableName,
			conditions: appliedSearchConditions,
			sort,
			pageSize,
			pageIndex,
		}),
	);
	const tableData = useFilteredList ? filteredTableData : fullTableData;
	// One by id
	const { data: searchByIdData } = useQuery(
		getSearchByIdOptions({
			...instanceParams,
			enabled: isEditModalOpen,
			databaseName: databaseName,
			tableName: tableName,
			ids: selectedIds,
		}),
	);

	const { mutate: addTableRecords, isPending: isAddTableRecordsPending } = useInsertTableRecords();
	const { mutate: updateTableRecords, isPending: isUpdateTableRecordsPending } = useUpdateTableRecords();
	const { mutate: deleteTableRecords, isPending: isDeleteTableRecordsPending } = useDeleteTableRecords();

	useEffect(() => {
		setTotalRecords(describeTableData.record_count);
		setTotalPages(Math.ceil(describeTableData.record_count / pageSize));
	}, [describeTableData, pageSize]);

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

	const refreshTable = useCallback(async () => {
		await refetchDescribeTableQueryOptions();
		await refetchSearchByValueOptions();
	}, [refetchDescribeTableQueryOptions, refetchSearchByValueOptions]);

	const onCSVDataAdded = useCallback((message: string) => {
		void refreshTable();
		setIsImportCSVModalOpen(false);
		toast.success(`${message}. Please wait a few moments then refresh the table.`);
	}, [refreshTable]);

	const onRowClick = (rowData: Row<Record<string, unknown>>) => {
		setSelectedIds([rowData.original[hashAttribute]]);
		setIsEditModalOpen(!isEditModalOpen);
	};
	const onColumnClick = (accessorKey: string, isAscending: boolean) => {
		setSort({
			attribute: accessorKey,
			descending: !isAscending,
		});
	};
	const onRefreshClick = useRefreshClick(refreshTable);

	const onAddClicked = useCallback(() => {
		setIsAddModalOpen(true);
	}, [setIsAddModalOpen]);

	const onImportCSVClicked = useCallback(() => {
		setIsImportCSVModalOpen(true);
	}, [setIsImportCSVModalOpen]);

	const onDeleted = useCallback((deleted: 'table' | 'database') =>
		void navigate({ to: deleted === 'table' ? '../' : '../../' }), [navigate]);

	const [columnVisibility, setColumnVisibility] = useSessionStorage(
		`ColumnDisplayed/${databaseName}}/${tableName}` as 'ColumnDisplayed/{database}/{table}',
		{} satisfies VisibilityState,
	);

	const openDeleteTable = useSetWatchedValue('ShowDeleteTable', true);
	const openDeleteDatabase = useSetWatchedValue('ShowDeleteDatabase', true);

	return (
		<>
			<div className="flex flex-col md:flex-row items-center justify-between space-y-3 md:space-y-0 md:space-x-3 pt-15 pb-4 pr-4">
				<div className="flex space-x-2">
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
					{canAddRecords && (
						<Button
							variant="positiveOutline"
							onClick={onImportCSVClicked}
							disabled={isImportCSVModalOpen || isAddTableRecordsPending}
							accessKey="c"
						>
							<ImportIcon />
							<span>
								Import <u>C</u>SV
							</span>
						</Button>
					)}
				</div>

				<div className="flex space-x-2">
					{filtersToggled && appliedSearchConditions && (
						<Button variant="ghost" onClick={clearFilters} accessKey="f">
							<FunnelXIcon className="inline-block " />
							<span>Clear <u>F</u>ilters</span>
						</Button>
					)}
					{filtersToggled && columnFiltersForm.formState.isDirty && (
						<Button variant="default" onClick={applyFilters}>
							<FunnelPlusIcon className="inline-block " />
							Apply Filters
						</Button>
					)}
					{filtersToggled && !appliedSearchConditions && (
						<Button variant="ghost" onClick={hideFilters} accessKey="f">
							<FunnelXIcon className="inline-block " />
							<span>Hide <u>F</u>ilters</span>
						</Button>
					)}

					{!filtersToggled && (
						<Button variant="ghost" onClick={showFilters} accessKey="f">
							<FunnelIcon className="inline-block " />
							<span>Show <u>F</u>ilters</span>
						</Button>
					)}

					<Button variant="defaultOutline" onClick={onRefreshClick} disabled={tableDataFetching}>
						<RefreshCwIcon />
					</Button>

					<PickColumnsDropdown
						columns={dataTableColumns}
						columnVisibility={columnVisibility}
						setColumnVisibility={setColumnVisibility}
					/>

					{canManageBrowseInstance && (<DropdownMenu>
						<DropdownMenuTrigger>
							<EllipsisIcon aria-label="Table options" />
						</DropdownMenuTrigger>
						<DropdownMenuContent side="bottom" align="end">
							{!isLastTableInDatabase && (
								<DropdownMenuItem className="focus:bg-red/70 focus:text-white" onClick={openDeleteTable}>
									<TrashIcon className="inline-block " />
									Drop Table
								</DropdownMenuItem>
							)}
							<DropdownMenuItem className="focus:bg-red/70 focus:text-white" onClick={openDeleteDatabase}>
								<Trash2Icon />
								Drop Database
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>)}
				</div>
			</div>

			<TableView<Record<string, unknown>, unknown>
				data={tableData?.data || []}
				isFetching={tableDataFetching}
				filtersToggled={filtersToggled}
				columns={dataTableColumns}
				columnVisibility={columnVisibility}
				onRowClick={onRowClick}
				onColumnClick={onColumnClick}
				totalPages={totalPages}
				totalRecords={totalRecords}
				pageIndex={pageIndex}
				pageSize={pageSize}
				columnFiltersForm={columnFiltersForm}
				applyFilters={applyFilters}
				setPageIndex={setPageIndex}
				setPageSize={setPageSize}
			/>
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

			<DeleteDatabaseModal databaseName={databaseName} onDeleted={onDeleted} />
			<DeleteTableModal databaseName={databaseName} tableName={tableName} onDeleted={onDeleted} />

			<ImportCSVModal
				isModalOpen={isImportCSVModalOpen}
				setIsModalOpen={setIsImportCSVModalOpen}
				onSaveChanges={onCSVDataAdded}
				database={databaseName}
				table={tableName}
			/>
		</>
	);
}
