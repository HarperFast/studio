import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdownMenu';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { formatBrowseDataTableHeader } from '@/features/instance/databases/functions/formatBrowseDataTableHeader';
import {
	buildRelationshipGetAttributes,
	collapsedForeignKeyNames,
	getRelationshipInfoMap,
	syntheticAttributeNames,
} from '@/features/instance/databases/functions/relationshipAttributes';
import { getSchemaRelationshipsQueryOptions } from '@/features/instance/databases/functions/schemaRelationships';
import { useExportTableCsv } from '@/features/instance/databases/hooks/useExportTableCsv';
import { EditTableRowModal } from '@/features/instance/databases/modals/EditTableRowModal';
import { useStaffPermission } from '@/hooks/useAuth';
import { useEffectedState } from '@/hooks/useEffectedState';
import {
	useInstanceBrowseManagePermission,
	useInstanceImportDataPermission,
	useInstanceSchemaTablePermission,
} from '@/hooks/usePermissions';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import { useToggler } from '@/hooks/useToggler';
import { InstanceDatabaseMap } from '@/integrations/api/api.patch';
import { useCleanupOrphanBlobsMutation } from '@/integrations/api/instance/database/cleanupOrphanBlobs';
import { useDeleteTableRecords } from '@/integrations/api/instance/database/deleteTableRecords';
import { getDescribeTableQueryOptions } from '@/integrations/api/instance/database/getDescribeTable';
import {
	getSearchByConditionsOptions,
	SearchCondition,
	translateColumnFilterToSearchConditions,
} from '@/integrations/api/instance/database/getSearchByConditions';
import { getSearchByIdOptions } from '@/integrations/api/instance/database/getSearchById';
import { getSearchByValueOptions } from '@/integrations/api/instance/database/getSearchByValue';
import { getTableRecordCountQueryOptions } from '@/integrations/api/instance/database/getTableRecordCount';
import { supportsPutOperation, usePutTableRecords } from '@/integrations/api/instance/database/putTableRecords';
import { useUpdateTableRecords } from '@/integrations/api/instance/database/updateTableRecords';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { setWatchedValue } from '@/lib/events/watcher';
import { keyBy } from '@/lib/keyBy';
import { onClickStopPropagation } from '@/lib/onClickStopPropagation';
import { Row } from '@/lib/table';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearch } from '@tanstack/react-router';
import { ColumnSizingState, ColumnVisibilityState } from '@tanstack/react-table';
import {
	BrushCleaningIcon,
	CircleCheckBigIcon,
	CircleIcon,
	CloudDownloadIcon,
	CloudUploadIcon,
	EllipsisIcon,
	ExternalLinkIcon,
	FunnelIcon,
	FunnelPlusIcon,
	FunnelXIcon,
	PlusIcon,
	RefreshCwIcon,
	Trash2Icon,
	TrashIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

	const instanceParams = useInstanceClientIdParams();
	const { clusterId, instanceId } = allParams;

	const { toggled: onlyIfCached, toggle: toggleOnlyCached } = useToggler(true);

	const isStaffInstanceOperator = useStaffPermission('instance:update');
	const canAddRecords = useInstanceSchemaTablePermission(instanceId ?? clusterId, databaseName, tableName, 'insert');
	const canImportData = useInstanceImportDataPermission(instanceId ?? clusterId, databaseName, tableName);
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
	// describe_all (which feeds `instanceDatabaseMap`) is fetched without record counts so it returns fast;
	// describe_table backfills this table's count asynchronously. Render schema from whichever arrives first
	// -- the map is usually ready before describe_table -- so columns and records are never gated on the
	// (slower) count scan. describe_table wins once present: it's the per-table, refresh-invalidated copy.
	const databaseTables = instanceDatabaseMap?.[databaseName];
	const tableFromMap = databaseTables?.[tableName];
	const instanceTable = describeTableData ?? tableFromMap;
	const attributesMap = useMemo(() => keyBy(instanceTable?.attributes ?? [], 'attribute'), [instanceTable]);
	// Newer Harper servers omit relationship attributes from describe entirely; the component
	// schema files still declare them (with exact from/to key mappings), so browse reads those too.
	const { data: schemaRelationshipMap } = useQuery(getSchemaRelationshipsQueryOptions(instanceParams));
	// Removing an attribute needs the `put` operation, added in Harper 5.3.0. The row editor has to
	// know before it offers the save, so the version is read here rather than discovered by a failure.
	const { data: registrationInfo } = useQuery(getRegistrationInfoQueryOptions(instanceParams));
	const instanceSupportsPut = supportsPutOperation(registrationInfo?.version);
	// `put` needs both insert and update on the table, not just update: it creates as well as replaces,
	// so a role with update alone gets a 403 from the server. Checking here keeps the editor from
	// offering a save that cannot land, and separates "too old" from "not allowed" in the message.
	const canReplaceRecords = instanceSupportsPut && canEditRecords && canAddRecords;
	const schemaRelationships = schemaRelationshipMap?.[databaseName]?.[tableName];
	// Relationship attributes get resolved cell values, link chips, and sub-property filters;
	// they are also excluded from record add/edit JSON since the server rejects writes that
	// assign them.
	const relationshipInfoMap = useMemo(
		() => getRelationshipInfoMap(instanceTable, databaseTables, schemaRelationships),
		[instanceTable, databaseTables, schemaRelationships],
	);
	const relationshipGetAttributes = useMemo(
		() => buildRelationshipGetAttributes(instanceTable, databaseTables),
		[instanceTable, databaseTables],
	);
	const syntheticAttributes = useMemo(
		() => syntheticAttributeNames(instanceTable?.attributes, databaseTables),
		[instanceTable, databaseTables],
	);
	const [selectedIds, setSelectedIds] = useEffectedState<null | unknown[]>(null, allParams);
	const [isEditModalOpen, setIsEditModalOpen] = useState(false);
	// The row the user clicked, straight from the list query. We keep it so the edit modal can fall
	// back to showing it read-only when the record can't be fetched by its declared primary key --
	// either the row has no value for that key, or it has one but nothing is stored under it (both
	// happen when a table's primary key was changed after rows existed; see #1199).
	const [clickedRow, setClickedRow] = useEffectedState<Record<string, unknown> | null>(null, allParams);

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

	const translateFilterValues = useCallback((values: Record<string, string | undefined>) => {
		const conditions: SearchCondition[] = [];
		for (const key in values) {
			const value = values[key];
			if (value?.length) {
				try {
					conditions.push(
						...translateColumnFilterToSearchConditions(key, value, attributesMap[key], relationshipInfoMap[key]),
					);
				} catch (err) {
					toast.error(String(err));
				}
			}
		}
		return conditions;
	}, [attributesMap, relationshipInfoMap]);

	const applyFilters = useCallback(() => {
		const conditions = translateFilterValues(columnFiltersValues);
		setAppliedSearchConditions(conditions.length ? conditions : null);
		resetFiltersForm({ ...columnFiltersValues });
	}, [translateFilterValues, resetFiltersForm, columnFiltersValues]);
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

	// Deep links can carry filters (?filters={column: "value"}) — relationship cell chips use this
	// to land on the related table filtered to the linked record. Applied once per distinct search,
	// after the schema arrives (translation needs attribute types). When the URL filters go away
	// (navigating to another table, or back to the bare table), the filter inputs are cleared too
	// so they don't linger stale — `appliedSearchConditions` already resets on table change, and
	// the visible inputs should stay in step with it.
	const { filters: urlFilters }: { filters?: Record<string, string> } = useSearch({ strict: false });
	const urlFiltersKey = JSON.stringify([databaseName, tableName, urlFilters ?? null]);
	const appliedUrlFiltersKey = useRef<string | null>(null);
	useEffect(function syncFiltersFromUrl() {
		if (!instanceTable || appliedUrlFiltersKey.current === urlFiltersKey) {
			return;
		}
		const isInitialSync = appliedUrlFiltersKey.current === null;
		appliedUrlFiltersKey.current = urlFiltersKey;
		if (urlFilters) {
			resetFiltersForm({ ...urlFilters });
			const conditions = translateFilterValues(urlFilters);
			setAppliedSearchConditions(conditions.length ? conditions : null);
			showFilters();
		} else if (!isInitialSync) {
			// Skip the initial mount (nothing to clear yet); otherwise drop the stale inputs a
			// prior URL filter (or another table) left behind.
			clearFilters();
		}
	}, [
		urlFilters,
		urlFiltersKey,
		instanceTable,
		resetFiltersForm,
		translateFilterValues,
		setAppliedSearchConditions,
		showFilters,
		clearFilters,
	]);

	const { dataTableColumns, primaryKey } = formatBrowseDataTableHeader(instanceTable, relationshipInfoMap);
	const [sort, setSort] = useEffectedState(
		{
			attribute: primaryKey,
			descending: false,
		},
		allParams,
	);

	// Reset to the first page when the table changes OR the applied filter changes. Without the
	// filter dependency a stale page (e.g. page 3 -> offset 40) would be sent with the new filter,
	// and a filter that matches fewer rows than that offset comes back empty (#1463).
	const [pageIndex, setPageIndex] = useEffectedState(0, [databaseName, tableName, appliedSearchConditions]);
	const [pageSize, setPageSize] = useState(20);

	// The count comes from whichever describe carries it: the map when the server still returns counts
	// (older backends), otherwise describe_table's async backfill. The first pass is always the cheap
	// estimate (a plain describe_table caps the count scan at ~500ms); the server returns an exact value
	// for small tables (no `estimated_record_range`) and a rounded estimate + range for large ones.
	const estimatedCount = describeTableData?.record_count ?? tableFromMap?.record_count;
	const estimatedRange = describeTableData?.estimated_record_range ?? tableFromMap?.estimated_record_range;

	// Exact count is opt-in: it forces a full, unbounded scan, so we only run it when the user asks for
	// it from the pagination tooltip. Reset the request when the table changes.
	const [wantExactCount, setWantExactCount] = useEffectedState(false, [databaseName, tableName]);
	const { data: exactCount, isFetching: isExactCountFetching, isError: isExactCountError, refetch: refetchExactCount } =
		useQuery(
			getTableRecordCountQueryOptions({ ...instanceParams, enabled: wantExactCount, databaseName, tableName }),
		);
	// First click enables the (initially disabled) query; later clicks retry a failed fetch via refetch.
	const requestExactCount = useCallback(() => {
		if (wantExactCount) {
			void refetchExactCount();
		} else {
			setWantExactCount(true);
		}
	}, [wantExactCount, refetchExactCount, setWantExactCount]);

	const totalRecords = exactCount ?? estimatedCount;
	const totalPages = totalRecords ? Math.ceil(totalRecords / pageSize) : 0;
	// A count is approximate only while we're still showing the estimate and the server flagged it as one.
	const isEstimatedCount = exactCount === undefined && estimatedRange !== undefined;

	const useFilteredList = filtersToggled && !!appliedSearchConditions;

	// Full list
	const searchByValueParams = {
		...instanceParams,
		enabled: !useFilteredList && !!primaryKey,
		databaseName,
		tableName,
		searchAttribute: primaryKey,
		sort,
		pageSize,
		pageIndex,
		onlyIfCached,
		getAttributes: relationshipGetAttributes,
	};
	const searchByValueOptions = getSearchByValueOptions(searchByValueParams);
	const { data: fullTableData, isFetching: tableDataFetching } = useQuery(searchByValueOptions);

	// Filtered list
	const searchByConditionsParams = {
		...instanceParams,
		enabled: useFilteredList && !!primaryKey,
		databaseName,
		tableName,
		conditions: appliedSearchConditions,
		sort,
		pageSize,
		pageIndex,
		onlyIfCached,
		getAttributes: relationshipGetAttributes,
	};
	const searchByConditionsOptions = getSearchByConditionsOptions(searchByConditionsParams);
	const { data: filteredTableData, isFetching: tableConditionsDataFetching } = useQuery(searchByConditionsOptions);

	const tableData = useFilteredList ? filteredTableData : fullTableData;
	const isFetching = tableDataFetching || tableConditionsDataFetching;

	// One by id
	const { data: searchByIdData, isFetching: isSearchByIdFetching, isError: isSearchByIdError } = useQuery(
		getSearchByIdOptions({
			...instanceParams,
			enabled: isEditModalOpen,
			databaseName: databaseName,
			tableName: tableName,
			ids: selectedIds,
		}),
	);

	// The clicked row can't be shown from the server in two cases, both stemming from a table whose
	// declared primary key doesn't match how its rows are actually stored (see #1199):
	//   - missingPrimaryKey: the row has no value for the declared primary key at all.
	//   - recordUnavailable: it has a value, we looked it up, but nothing is stored under that key
	//     (Harper kept keying rows by the original attribute), so the fetch comes back empty.
	// In both cases we show the row the list already gave us, read-only, with an explanation.
	const missingPrimaryKey = isEditModalOpen && !!clickedRow && (primaryKey ? clickedRow[primaryKey] == null : true);
	const fetchedRecord = searchByIdData?.data;
	const recordUnavailable = !missingPrimaryKey
		&& !!selectedIds?.length
		&& !isSearchByIdFetching
		&& (isSearchByIdError || (Array.isArray(fetchedRecord) && fetchedRecord.length === 0));

	const { mutate: updateTableRecords, isPending: isUpdateTableRecordsPending } = useUpdateTableRecords();
	const { mutate: deleteTableRecords, isPending: isDeleteTableRecordsPending } = useDeleteTableRecords();
	const { mutate: putTableRecords, isPending: isPutTableRecordsPending } = usePutTableRecords();
	const { mutate: cleanupOrphanBlobs, isPending: isCleanupOrphanBlobsPending } = useCleanupOrphanBlobsMutation();

	const queryClient = useQueryClient();
	const refreshTable = useCallback(
		() => queryClient.invalidateQueries({ queryKey: [instanceParams.entityId, databaseName, tableName] }),
		[queryClient, instanceParams.entityId, databaseName, tableName],
	);

	const onCleanupOrphanBlobs = useCallback(async () => {
		if (!confirm(`Are you sure you want to cleanup orphan blobs for database "${databaseName}"?`)) {
			return;
		}

		cleanupOrphanBlobs({
			...instanceParams,
			databaseName,
		}, {
			onSuccess: (data) => {
				toast.success(data.message || 'Orphan blobs cleanup started successfully');
				refreshTable();
			},
			onError: (error) => {
				toast.error(error instanceof Error ? error.message : 'Failed to cleanup orphan blobs');
			},
		});
	}, [cleanupOrphanBlobs, databaseName, instanceParams, refreshTable]);

	// The toolbar exports what's on screen (active filters + sort); the tree/overview export the whole
	// table. Both go through the shared hook, which fetches raw records (no relationship get_attributes)
	// -- resolved relationship objects don't serialize usefully into CSV cells.
	const { exportCsv, isExporting: isExportingCSV } = useExportTableCsv();
	const onExportCSVClicked = useCallback(() => {
		void exportCsv({
			databaseName,
			tableName,
			primaryKey,
			sort,
			conditions: useFilteredList ? appliedSearchConditions : null,
		});
	}, [exportCsv, databaseName, tableName, primaryKey, sort, useFilteredList, appliedSearchConditions]);

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

	// Removing an attribute needs `put`, which replaces the record: `update` merges what it is sent,
	// so an omitted attribute keeps its stored value and `null` stores a null (#1643). The modal
	// reaches this only for an edit that actually removes one — an edit that just changes values
	// stays an `update`, since a replace is last-writer-wins over the whole record.
	//
	// One atomic write, unlike the delete-then-insert a client would otherwise need: the record is
	// never absent, `__createdtime__` survives, and subscribers see a single write.
	const onRecordReplace = useCallback((records: Record<string, unknown>[]) => {
		putTableRecords(
			{
				...instanceParams,
				databaseName,
				tableName,
				records,
			},
			{
				onSuccess: () => {
					void refreshTable();
					setIsEditModalOpen(false);
					toast.success('Record updated successfully');
				},
			},
		);
	}, [putTableRecords, instanceParams, databaseName, tableName, refreshTable]);

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

	const onRowClick = (rowData: Row<Record<string, unknown>>) => {
		const primaryKeyValue = primaryKey ? rowData.original[primaryKey] : undefined;
		setClickedRow(rowData.original);
		// With no usable primary key there's nothing to look up, so skip the (doomed) fetch; otherwise
		// fetch the fresh record. Either way the modal can fall back to `clickedRow`.
		setSelectedIds(primaryKeyValue == null ? null : [primaryKeyValue]);
		setIsEditModalOpen(true);
	};
	const onColumnClick = (accessorKey: string, isAscending: boolean) => {
		setSort({
			attribute: accessorKey,
			descending: !isAscending,
		});
	};
	const onRefreshClick = useRefreshClick(refreshTable);

	const onAddClicked = useCallback(() => {
		setWatchedValue('ShowAddTableRecords', { databaseName, tableName });
	}, [databaseName, tableName]);

	const onImportDataClicked = useCallback(() => {
		setWatchedValue('ShowImportData', { databaseName, tableName });
	}, [databaseName, tableName]);

	const [storedColumnVisibility, setColumnVisibility] = useSessionStorage(
		`ColumnDisplayed/${databaseName}/${tableName}` as 'ColumnDisplayed/{database}/{table}',
		{} satisfies ColumnVisibilityState,
	);
	// A relationship column shows the same key values as the foreign key backing it (and links
	// them), so the foreign-key column is collapsed away by default. The user's own choices win:
	// re-showing it from the Columns picker stores an explicit `true` that overrides the default.
	const columnVisibility = useMemo((): ColumnVisibilityState => ({
		...Object.fromEntries(collapsedForeignKeyNames(relationshipInfoMap).map((name) => [name, false])),
		...storedColumnVisibility,
	}), [relationshipInfoMap, storedColumnVisibility]);

	const [columnSizing, setColumnSizing] = useSessionStorage(
		`ColumnSizing/${databaseName}/${tableName}` as 'ColumnSizing/{database}/{table}',
		{} satisfies ColumnSizingState,
	);

	return (
		<>
			<div className="flex flex-col md:flex-row items-center justify-between space-y-3 md:space-y-0 md:space-x-3 pt-15 pb-4 pr-4">
				<div className="flex space-x-2">
					{canAddRecords && (
						<Button
							variant="positiveOutline"
							onClick={onAddClicked}
							accessKey="n"
						>
							<PlusIcon />
							<span>
								Add <u>N</u>ew Record(s)
							</span>
						</Button>
					)}
					{canImportData && (
						<Button
							variant="positiveOutline"
							onClick={onImportDataClicked}
							accessKey="i"
						>
							<CloudUploadIcon />
							<span>
								<u>I</u>mport Data
							</span>
						</Button>
					)}
					<Button
						variant="positiveOutline"
						onClick={onExportCSVClicked}
						disabled={isExportingCSV}
						accessKey="e"
					>
						<CloudDownloadIcon />
						<span>
							<u>E</u>xport CSV
						</span>
					</Button>
				</div>

				<div className="flex space-x-2">
					{filtersToggled && appliedSearchConditions && (
						<Button type="button" variant="ghost" onClick={clearFilters} accessKey="f">
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
						<DropdownMenuTrigger asChild disabled={!instanceDatabaseMap}>
							<Button variant="ghost" size="icon" disabled={!instanceDatabaseMap}>
								<EllipsisIcon aria-label="Table options" />
							</Button>
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
							{canManageBrowseInstance
								&& isStaffInstanceOperator
								&& !!instanceId && (
								<DropdownMenuItem
									className="focus:bg-yellow/70 focus:text-white"
									onClick={onCleanupOrphanBlobs}
									disabled={isCleanupOrphanBlobsPending}
								>
									<BrushCleaningIcon className="text-yellow " />
									Cleanup Orphan Blobs
								</DropdownMenuItem>
							)}
							{canManageBrowseInstance && !isLastTableInDatabase && (
								<DropdownMenuItem
									className="focus:bg-red/70 focus:text-white"
									onClick={() => setWatchedValue('ShowDeleteTable', { databaseName, tableName })}
								>
									<TrashIcon className="inline-block " />
									Drop Table
								</DropdownMenuItem>
							)}
							{canManageBrowseInstance
								&& (
									<DropdownMenuItem
										className="focus:bg-red/70 focus:text-white"
										onClick={() => setWatchedValue('ShowDeleteDatabase', { databaseName })}
									>
										<Trash2Icon />
										Drop Database
									</DropdownMenuItem>
								)}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			<TableView<Record<string, unknown>>
				primaryKey={primaryKey}
				data={tableData?.data}
				isFetching={isFetching}
				filtersToggled={filtersToggled}
				columns={dataTableColumns}
				columnVisibility={columnVisibility}
				columnSizing={columnSizing}
				setColumnSizing={setColumnSizing}
				onRowClick={onRowClick}
				onColumnClick={onColumnClick}
				totalPages={totalPages}
				totalRecords={totalRecords}
				isEstimatedCount={isEstimatedCount}
				estimatedRange={estimatedRange}
				isExactCountFetching={isExactCountFetching}
				isExactCountError={isExactCountError}
				onRequestExactCount={requestExactCount}
				pageIndex={pageIndex}
				pageSize={pageSize}
				columnFiltersForm={columnFiltersForm}
				applyFilters={applyFilters}
				setPageIndex={setPageIndex}
				setPageSize={setPageSize}
			/>
			<EditTableRowModal
				canEditRecords={canEditRecords}
				canDeleteRecords={canDeleteRecords}
				canReplaceRecords={canReplaceRecords}
				replaceBlockedReason={canReplaceRecords ? undefined : (instanceSupportsPut ? 'permission' : 'version')}
				setIsModalOpen={setIsEditModalOpen}
				isModalOpen={isEditModalOpen}
				primaryKey={primaryKey}
				missingPrimaryKey={missingPrimaryKey}
				recordUnavailable={recordUnavailable}
				syntheticAttributes={syntheticAttributes}
				data={missingPrimaryKey || recordUnavailable
					? (clickedRow ? [clickedRow] : undefined)
					: searchByIdData?.data}
				onSaveChanges={onRecordUpdate}
				onReplaceRecord={onRecordReplace}
				onDeleteRecord={onDeleteRecord}
				isUpdateTableRecordsPending={isUpdateTableRecordsPending || isPutTableRecordsPending}
				isDeleteTableRecordsPending={isDeleteTableRecordsPending}
			/>
		</>
	);
}
