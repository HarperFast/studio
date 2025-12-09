import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdownMenu';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { formatBrowseDataTableHeader } from '@/features/instance/databases/functions/formatBrowseDataTableHeader';
import { AddTableRowModal } from '@/features/instance/databases/modals/AddTableRowModal';
import { DeleteDatabaseModal } from '@/features/instance/databases/modals/DeleteDatabaseModal';
import { DeleteTableModal } from '@/features/instance/databases/modals/DeleteTableModal';
import { EditTableRowModal } from '@/features/instance/databases/modals/EditTableRowModal';
import { ImportCSVModal } from '@/features/instance/databases/modals/ImportCSVModal';
import { useEffectedState } from '@/hooks/useEffectedState';
import { useInstanceBrowseManagePermission, useInstanceSchemaTablePermission } from '@/hooks/usePermissions';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import { useToggler } from '@/hooks/useToggler';
import { InstanceDatabaseMap } from '@/integrations/api/api.patch';
import { useDeleteTableRecords } from '@/integrations/api/instance/database/deleteTableRecords';
import { getDescribeTableQueryOptions } from '@/integrations/api/instance/database/getDescribeTable';
import {
	getSearchByConditionsOptions,
	SearchCondition,
	translateColumnFilterToSearchConditions,
} from '@/integrations/api/instance/database/getSearchByConditions';
import { getSearchByIdOptions } from '@/integrations/api/instance/database/getSearchById';
import { getSearchByValueOptions } from '@/integrations/api/instance/database/getSearchByValue';
import { useUpdateTableRecords } from '@/integrations/api/instance/database/updateTableRecords';
import { useSetWatchedValue } from '@/lib/events/watcher';
import { keyBy } from '@/lib/keyBy';
import { onClickStopPropagation } from '@/lib/onClickStopPropagation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { Row, VisibilityState } from '@tanstack/react-table';
import {
	CircleCheckBigIcon,
	CircleIcon,
	EllipsisIcon,
	ExternalLinkIcon,
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
import { ColumnFiltersSchema } from './ColumnFilters';
import { PickColumnsDropdown } from './PickColumnsDropdown';
import { TableView } from './TableView';

export function DatabaseTableView({ instanceDatabaseMap, databaseName, tableName }: {
	instanceDatabaseMap?: InstanceDatabaseMap;
	databaseName: string;
	tableName: string;
}) {
	const allParams: {
		clusterId?: string;
		instanceId?: string;
	} = useParams({ strict: false });

	const navigate = useNavigate();
	const instanceParams = useInstanceClientIdParams();
	const { clusterId, instanceId } = allParams;

	const { toggled: onlyIfCached, toggle: toggleOnlyCached } = useToggler(true);

	const canAddRecords = useInstanceSchemaTablePermission(instanceId ?? clusterId, databaseName, tableName, 'insert');
	const canEditRecords = useInstanceSchemaTablePermission(instanceId ?? clusterId, databaseName, tableName, 'update');
	const canDeleteRecords = useInstanceSchemaTablePermission(instanceId ?? clusterId, databaseName, tableName, 'delete');
	const canManageBrowseInstance = useInstanceBrowseManagePermission();

	const { data: describeTableData } = useQuery(
		getDescribeTableQueryOptions({
			...instanceParams,
			databaseName,
			tableName,
		}),
	);
	const attributesMap = useMemo(() => keyBy(describeTableData?.attributes ?? [], 'attribute'), [describeTableData]);
	const [selectedIds, setSelectedIds] = useEffectedState<null | unknown[]>(null, allParams);
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);

	const isLastTableInDatabase = useMemo(() => {
		const tableNames = databaseName ? Object.keys(instanceDatabaseMap?.[databaseName] || []).sort() : [];
		return tableNames.length === 1;
	}, [instanceDatabaseMap, databaseName]);

	const { toggled: filtersToggled, toggleOn: showFilters, toggleOff: hideFilters } = useToggler(false);
	const columnFiltersForm = useForm({
		resolver: zodResolver(ColumnFiltersSchema),
	});
	const { reset: resetFiltersForm } = columnFiltersForm;
	const columnFiltersValues = columnFiltersForm.watch();

	const [appliedSearchConditions, setAppliedSearchConditions] = useEffectedState<SearchCondition[] | null>(null, [
		allParams.clusterId,
		allParams.instanceId,
		databaseName,
		tableName,
	]);

	const applyFilters = useCallback(() => {
		const conditions: SearchCondition[] = [];
		for (const key in columnFiltersValues) {
			if (columnFiltersValues[key]?.length) {
				try {
					conditions.push(
						...translateColumnFilterToSearchConditions(key, columnFiltersValues[key], attributesMap[key]),
					);
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

	useEffect(function clearFiltersWhenParamsChange() {
		return clearFilters();
	}, [allParams, clearFilters]);

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

	const [pageIndex, setPageIndex] = useEffectedState(0, [databaseName, tableName]);
	const [pageSize, setPageSize] = useState(20);

	const totalRecords = describeTableData?.record_count;
	const totalPages = describeTableData?.record_count ? Math.ceil(describeTableData.record_count / pageSize) : 0;

	const useFilteredList = filtersToggled && !!appliedSearchConditions;

	// Full list
	const {
		data: fullTableData,
		isFetching: tableDataFetching,
	} = useQuery(
		getSearchByValueOptions({
			...instanceParams,
			enabled: !useFilteredList && !!hashAttribute,
			databaseName,
			tableName,
			searchAttribute: hashAttribute,
			sort,
			pageSize,
			pageIndex,
			onlyIfCached,
		}),
	);

	// Filtered list
	const {
		data: filteredTableData,
		isFetching: tableConditionsDataFetching,
	} = useQuery(
		getSearchByConditionsOptions({
			...instanceParams,
			enabled: useFilteredList && !!hashAttribute,
			databaseName,
			tableName,
			conditions: appliedSearchConditions,
			sort,
			pageSize,
			pageIndex,
			onlyIfCached,
		}),
	);

	const tableData = useFilteredList ? filteredTableData : fullTableData;
	const isFetching = tableDataFetching || tableConditionsDataFetching;

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

	const { mutate: updateTableRecords, isPending: isUpdateTableRecordsPending } = useUpdateTableRecords();
	const { mutate: deleteTableRecords, isPending: isDeleteTableRecordsPending } = useDeleteTableRecords();

	const queryClient = useQueryClient();
	const refreshTable = useCallback(
		() => queryClient.invalidateQueries({ queryKey: [instanceParams.entityId, databaseName, tableName] }),
		[queryClient, instanceParams.entityId, databaseName, tableName],
	);

	const onRecordUpdate = useCallback((data: Record<string, unknown>[]) => {
		updateTableRecords(
			{
				...instanceParams,
				databaseName,
				tableName,
				records: data,
			},
			{
				onSuccess: () => {
					void refreshTable();
					setIsEditModalOpen(false);
					toast.success('Record updated successfully');
				},
			},
		);
	}, [updateTableRecords, instanceParams, databaseName, tableName, refreshTable]);

	const onDeleteRecord = useCallback((hashes: unknown[]) => {
		deleteTableRecords(
			{
				...instanceParams,
				databaseName,
				tableName,
				hashValues: hashes,
			},
			{
				onSuccess: () => {
					void refreshTable();
					setIsEditModalOpen(false);
					toast.success('Record deleted successfully');
				},
			},
		);
	}, [deleteTableRecords, instanceParams, databaseName, tableName, refreshTable]);

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

	const onDeleted = useCallback(
		(deleted: 'table' | 'database') => void navigate({ to: deleted === 'table' ? '../' : '../../' }),
		[navigate],
	);

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
							disabled={isAddModalOpen}
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
							disabled={isImportCSVModalOpen}
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
							<span>
								Clear <u>F</u>ilters
							</span>
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
							<span>
								Hide <u>F</u>ilters
							</span>
						</Button>
					)}

					{!filtersToggled && (
						<Button variant="ghost" onClick={showFilters} accessKey="f">
							<FunnelIcon className="inline-block " />
							<span>
								Show <u>F</u>ilters
							</span>
						</Button>
					)}

					<Button
						variant="defaultOutline"
						onClick={onRefreshClick}
						disabled={isFetching}
					>
						<RefreshCwIcon />
					</Button>

					<PickColumnsDropdown
						columns={dataTableColumns}
						columnVisibility={columnVisibility}
						setColumnVisibility={setColumnVisibility}
					/>

					<DropdownMenu>
						<DropdownMenuTrigger disabled={!instanceDatabaseMap}>
							<EllipsisIcon aria-label="Table options" color={!instanceDatabaseMap ? 'gray' : 'white'} />
						</DropdownMenuTrigger>
						<DropdownMenuContent side="bottom" align="end">
							<DropdownMenuItem className="focus:bg-primary/70 focus:text-white" onClick={toggleOnlyCached}>
								{onlyIfCached ? <CircleCheckBigIcon className="text-green" /> : <CircleIcon />}
								Only If Cached
								<Link
									to="https://docs.harperdb.io/docs/developers/applications/caching#cache-control-header"
									target="_blank"
									rel="noopener noreferrer"
									onClick={onClickStopPropagation}
								>
									<ExternalLinkIcon />
								</Link>
							</DropdownMenuItem>
							{canManageBrowseInstance && !isLastTableInDatabase && (
								<DropdownMenuItem className="focus:bg-red/70 focus:text-white" onClick={openDeleteTable}>
									<TrashIcon className="inline-block " />
									Drop Table
								</DropdownMenuItem>
							)}
							{canManageBrowseInstance
								&& (
									<DropdownMenuItem className="focus:bg-red/70 focus:text-white" onClick={openDeleteDatabase}>
										<Trash2Icon />
										Drop Database
									</DropdownMenuItem>
								)}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			<TableView<Record<string, unknown>, unknown>
				data={tableData?.data}
				isFetching={isFetching}
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
			{canAddRecords && describeTableData && isAddModalOpen && (
				<AddTableRowModal
					instanceTable={describeTableData}
					isModalOpen={isAddModalOpen}
					refreshTable={refreshTable}
					setIsModalOpen={setIsAddModalOpen}
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
