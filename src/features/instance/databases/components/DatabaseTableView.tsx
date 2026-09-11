import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdownMenu';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { formatBrowseDataTableHeader } from '@/features/instance/databases/functions/formatBrowseDataTableHeader';
import { randomizableAttributes } from '@/features/instance/databases/functions/generateRandomRecords';
import {
	buildRelationshipGetAttributes,
	collapsedForeignKeyNames,
	getRelationshipInfoMap,
	syntheticAttributeNames,
} from '@/features/instance/databases/functions/relationshipAttributes';
import { getSchemaRelationshipsQueryOptions } from '@/features/instance/databases/functions/schemaRelationships';
import { useExportTableCsv } from '@/features/instance/databases/hooks/useExportTableCsv';
import { EditTableRowModal, RecordNavigation } from '@/features/instance/databases/modals/EditTableRowModal';
import { useStaffPermission } from '@/hooks/useAuth';
import { useEffectedState } from '@/hooks/useEffectedState';
import {
	useInstanceBrowseManagePermission,
	useInstanceImportCapabilities,
	useInstanceImportDataPermission,
	useInstanceSchemaTablePermission,
	useInstanceTablePutPermission,
} from '@/hooks/usePermissions';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { useSessionStorage } from '@/hooks/useSessionStorage';
import { useToggler } from '@/hooks/useToggler';
import { InstanceDatabaseMap } from '@/integrations/api/api.patch';
import { useCleanupOrphanBlobsMutation } from '@/integrations/api/instance/database/cleanupOrphanBlobs';
import {
	describeIncompleteDelete,
	useDeleteTableRecords,
} from '@/integrations/api/instance/database/deleteTableRecords';
import { getDescribeTableQueryOptions } from '@/integrations/api/instance/database/getDescribeTable';
import {
	getSearchByConditionsOptions,
	SearchCondition,
	translateColumnFilterToSearchConditions,
} from '@/integrations/api/instance/database/getSearchByConditions';
import { getSearchByIdOptions, searchByIdInvalidationKey } from '@/integrations/api/instance/database/getSearchById';
import { getSearchByValueOptions } from '@/integrations/api/instance/database/getSearchByValue';
import { getTableRecordCountQueryOptions } from '@/integrations/api/instance/database/getTableRecordCount';
import { IncompleteWrite } from '@/integrations/api/instance/database/incompleteWrite';
import {
	describeIncompletePut,
	replaceRecordsBlockedReason,
	usePutTableRecords,
} from '@/integrations/api/instance/database/putTableRecords';
import {
	describeIncompleteUpdate,
	useUpdateTableRecords,
} from '@/integrations/api/instance/database/updateTableRecords';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { setWatchedValue } from '@/lib/events/watcher';
import { keyBy } from '@/lib/keyBy';
import { onClickStopPropagation } from '@/lib/onClickStopPropagation';
import { pluralize } from '@/lib/pluralize';
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
import { EmptyResultSet } from './EmptyResultSet';
import { PickColumnsDropdown } from './PickColumnsDropdown';
import { rowSelectionKey, TableRowSelection, TableView } from './TableView';

// Stable so `useEffectedState` can reset to it without rebuilding a set on every render.
const EMPTY_SELECTION: ReadonlySet<unknown> = new Set();

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
	const importCapabilities = useInstanceImportCapabilities();
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

	// What the empty state may actually invite, each gated on the source it would use rather than on
	// `methods.*`: `methods.sample` and `methods.file` share one path (see IMPORT_METHOD_PATHS), so
	// either is true for a bare `insert` grant -- which offers a dataset dropdown with nothing in it
	// on a table that has no columns to generate rows for.
	const canImportFile = canImportData && importCapabilities.methods.file;
	const canImportUrl = canImportData && importCapabilities.methods.url;
	const canSeedSample = canImportData && importCapabilities.allowsSource('csv-data');
	// Read the attributes from the same map the modal's Random Data option reads (NOT the
	// describe-first `instanceTable`): where the two disagree, offering Seed reopens the empty-dropdown
	// dead end this gate exists to close.
	const fillableAttributes = useMemo(
		() => randomizableAttributes(tableFromMap?.attributes, databaseTables),
		[tableFromMap, databaseTables],
	);
	const canSeedRandom = canImportData
		&& importCapabilities.allowsSource('json-records')
		&& fillableAttributes.length > 0;
	const attributesMap = useMemo(() => keyBy(instanceTable?.attributes ?? [], 'attribute'), [instanceTable]);
	// Newer Harper servers omit relationship attributes from describe entirely; the component
	// schema files still declare them (with exact from/to key mappings), so browse reads those too.
	const { data: schemaRelationshipMap } = useQuery(getSchemaRelationshipsQueryOptions(instanceParams));
	// Removing an attribute needs the `put` operation, added in Harper 5.3.0. The row editor has to
	// know before it offers the save, so the version is read here rather than discovered by a failure.
	const { data: registrationInfo } = useQuery(getRegistrationInfoQueryOptions(instanceParams));
	// Not `canEditRecords && canAddRecords`: those fold in the `update`/`insert` operation allowlists,
	// which Harper doesn't require for `put`, and they stay true for an attribute-scoped role that
	// Harper refuses outright. `put` has its own authorization shape, so it gets its own check.
	const hasReplaceGrants = useInstanceTablePutPermission(instanceId ?? clusterId, databaseName, tableName);
	const replaceBlockedReason = replaceRecordsBlockedReason(registrationInfo?.version, hasReplaceGrants);
	const canReplaceRecords = replaceBlockedReason === undefined;
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
	// Where the open record sits in the page the grid is showing, so the editor can say which record
	// it is and step to its neighbours. Null when nothing is open.
	const [openRowIndex, setOpenRowIndex] = useEffectedState<number | null>(null, allParams);
	// A step off either end of the page can only open its record once the neighbouring page has been
	// fetched: which end of it to open, plus the page to put the grid back on if that fetch brings
	// nothing (an empty page, or a failed request -- both list queries are `retry: false`).
	const [pendingRecordStep, setPendingRecordStep] = useState<{ end: 'first' | 'last'; fromPage: number } | null>(
		null,
	);
	// While that page loads, the open record is the one the user stepped away from -- so the editor
	// shows nothing rather than a record its own header can no longer name.
	const isStepPending = pendingRecordStep !== null;

	// Only `describe_all` (`instanceDatabaseMap`) knows how many tables the database has, and an
	// allowlist can grant `describe_table` + search without it -- so a table can render fine while
	// this stays unanswered. Phrased as the decision rather than the fact ("is this the last table?"
	// answers `false` when it simply doesn't know, which would offer an irreversible action on a
	// guess): dropping a table needs positive evidence that another one remains.
	const canDropTable = useMemo(
		() => canManageBrowseInstance && !!databaseTables && Object.keys(databaseTables).length > 1,
		[canManageBrowseInstance, databaseTables],
	);

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

	// The index of a page a step has proven to be the last one. A full page can't say whether more
	// records follow, so the step probes; an empty answer is the only proof, and remembering it
	// keeps the Next button from offering that same dead probe again.
	const [knownLastPage, setKnownLastPage] = useEffectedState<number | null>(null, [
		databaseName,
		tableName,
		appliedSearchConditions,
		// A page index means nothing once the page size changes: page 0 proven terminal at 250 rows
		// says nothing about page 0 at 20. The cache mode changes which records the list returns at
		// all, so it retires the proof too.
		pageSize,
		onlyIfCached,
	]);

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

	// The scroll container in TableView is reused across all of these, so it needs to be told when the
	// rows under it change. These are exactly the inputs the row queries below are keyed on, i.e. "which
	// records are on screen"; the table identity is called out separately because a different table also
	// means a different set of columns.
	const tableIdentity = `${databaseName}.${tableName}`;
	const resultSetKey = JSON.stringify([
		tableIdentity,
		pageIndex,
		pageSize,
		sort,
		useFilteredList ? appliedSearchConditions : null,
	]);

	// Primary-key values of the checked rows. Selection describes the rows on screen, so it is dropped
	// whenever they change -- otherwise paging away would leave a "Delete Selected" armed with records
	// the user can no longer see.
	//
	// `resultSetKey` describes which rows the grid ASKED for, which is not the whole of "the rows on
	// screen", so selection gets its own epoch on top of it:
	//   - `entityId` -- which server answers. The route swaps instances without remounting this
	//     component, which is why every sibling piece of per-instance state resets on `allParams`;
	//     a key carried across that boundary would aim the delete at whatever the NEXT instance
	//     happens to store under it.
	//   - `onlyIfCached` -- the cache mode changes which records come back at all, the same reason
	//     `knownLastPage` above retires on it.
	const selectionEpoch = JSON.stringify([instanceParams.entityId, resultSetKey, onlyIfCached]);
	const [selectedKeys, setSelectedKeys] = useEffectedState<ReadonlySet<unknown>>(EMPTY_SELECTION, [selectionEpoch]);
	const toggleRowSelected = useCallback((key: unknown) => {
		setSelectedKeys((current) => {
			const next = new Set(current);
			if (!next.delete(key)) {
				next.add(key);
			}
			return next;
		});
	}, [setSelectedKeys]);
	const toggleAllSelected = useCallback((keys: unknown[], selectAll: boolean) => {
		setSelectedKeys(selectAll ? new Set(keys) : EMPTY_SELECTION);
	}, [setSelectedKeys]);
	// No delete permission, no reason to offer a selection: the grid renders no checkbox column at all.
	const rowSelection = useMemo((): TableRowSelection | undefined =>
		canDeleteRecords
			? { selectedKeys, toggleRow: toggleRowSelected, toggleAll: toggleAllSelected }
			: undefined, [canDeleteRecords, selectedKeys, toggleRowSelected, toggleAllSelected]);

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
	const { data: fullTableData, isFetching: tableDataFetching, isError: isFullTableError } = useQuery(
		searchByValueOptions,
	);

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
	const { data: filteredTableData, isFetching: tableConditionsDataFetching, isError: isFilteredTableError } = useQuery(
		searchByConditionsOptions,
	);

	const tableData = useFilteredList ? filteredTableData : fullTableData;
	const isFetching = tableDataFetching || tableConditionsDataFetching;
	// Whether the page the grid is asking for came back as a failure. Needed by the pending step
	// below: with `retry: false`, a failed page leaves `pageRows` undefined forever, which is
	// otherwise indistinguishable from a fetch still in flight.
	const isPageError = useFilteredList ? isFilteredTableError : isFullTableError;
	// The page the grid is showing. Undefined while a page is in flight -- neither list query keeps
	// the previous page's data -- which is what tells a pending record step that its page hasn't
	// arrived yet.
	const pageRows = tableData?.data;

	// What counts as selected is DERIVED from the rows on screen, not just read out of the stored
	// set. The epoch reset and the refresh clear bound what can accumulate, but neither fires when
	// the list query swaps its rows under unchanged parameters -- adding a record invalidates this
	// query and can push a checked row onto another page, and React Query refetches on window focus
	// (this app registers no `defaultOptions`, so that default is live). Either leaves a key in the
	// set with no row to show for it, and "Delete Selected" armed for a record nobody can see.
	// Deriving makes "the selection describes rows on screen" hold by construction rather than by
	// remembering to clear at every moment that could break it.
	const visibleSelectedKeys = useMemo(
		() =>
			(pageRows ?? [])
				.map((row) => rowSelectionKey(row, primaryKey))
				.filter((key) => key !== undefined && selectedKeys.has(key)),
		[pageRows, primaryKey, selectedKeys],
	);

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
	const missingPrimaryKey = isEditModalOpen && !isStepPending && !!clickedRow
		&& (primaryKey ? clickedRow[primaryKey] == null : true);
	const fetchedRecord = searchByIdData?.data;
	const recordUnavailable = !missingPrimaryKey
		&& !isStepPending
		&& !!selectedIds?.length
		&& !isSearchByIdFetching
		&& (isSearchByIdError || (Array.isArray(fetchedRecord) && fetchedRecord.length === 0));

	const { mutate: updateTableRecords, isPending: isUpdateTableRecordsPending } = useUpdateTableRecords();
	const { mutate: deleteTableRecords, isPending: isDeleteTableRecordsPending } = useDeleteTableRecords();
	const { mutate: putTableRecords, isPending: isPutTableRecordsPending } = usePutTableRecords();
	const { mutate: cleanupOrphanBlobs, isPending: isCleanupOrphanBlobsPending } = useCleanupOrphanBlobsMutation();

	const queryClient = useQueryClient();
	const refreshTable = useCallback(
		() => {
			// Records may have been added since a step proved a page terminal, so that proof retires
			// with the data it was made against.
			setKnownLastPage(null);
			// So does the selection: it names records by primary key, and a refetch is precisely the
			// moment the rows behind those keys can change without the query params moving. Anything
			// that refreshes the grid -- the toolbar button, a write of ours, another writer's row
			// landing -- leaves the checked set describing rows nobody has looked at.
			setSelectedKeys(EMPTY_SELECTION);
			return queryClient.invalidateQueries({ queryKey: [instanceParams.entityId, databaseName, tableName] });
		},
		[queryClient, instanceParams.entityId, databaseName, tableName, setKnownLastPage, setSelectedKeys],
	);
	// `refreshTable`'s prefix does NOT reach the open record: `getSearchById` keys on
	// `[entityId, 'search_by_id', databaseName, tableName, ids]`, so `'search_by_id'` sits where the
	// prefix expects the database name and partial matching fails. Without this, a removal that landed
	// left the row editor's cached record intact, and reopening that row within its gcTime rendered the
	// attribute the user had just removed — the exact symptom #1643 is about.
	const refreshOpenRecord = useCallback(
		() =>
			queryClient.invalidateQueries({
				queryKey: searchByIdInvalidationKey(instanceParams.entityId, databaseName, tableName),
			}),
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

	// One policy for both write paths, deliberately shared: every asymmetry between them so far has
	// come from changing one and not the other.
	//
	// A 200 is not proof the write landed — `update` skips a record it can't address and still answers
	// 200 — so an incomplete answer must not claim success. The editor stays open so the user can act
	// on the message with their edit intact, which is also why the refresh is conditional:
	// `refreshTable` invalidates this table's whole query prefix including the open record, and a
	// refetched record resets the editor's draft by design (#1600). Skip it only when the answer says
	// plainly that nothing was written — there is nothing new to read then. An undecidable answer
	// refreshes, because the write may have landed and replicated.
	const onWriteSettled = useCallback((incomplete: IncompleteWrite | undefined) => {
		if (incomplete?.wroteNothing) {
			// Nothing landed, so nothing is stale and the draft is still what the user needs in order to
			// act on the message. Refresh neither, and leave the editor open.
			toast.error("The record wasn't updated", { description: incomplete.message });
			return;
		}
		// Anything else — a full write, a partial one, or an answer we couldn't read — may have changed
		// the record, so both the grid and the open record are refreshed and the editor closes rather
		// than sitting on a draft written against data that has since moved.
		void refreshTable();
		void refreshOpenRecord();
		setIsEditModalOpen(false);
		if (incomplete) {
			toast.error("The record wasn't fully updated", { description: incomplete.message });
			return;
		}
		toast.success('Record updated successfully');
	}, [refreshTable, refreshOpenRecord]);

	const onRecordUpdate = useCallback((data: Record<string, unknown>[]) => {
		updateTableRecords(
			{
				...instanceParams,
				databaseName,
				tableName,
				records: data,
			},
			{
				onSuccess: (response) => onWriteSettled(describeIncompleteUpdate(response, data.length)),
			},
		);
	}, [updateTableRecords, instanceParams, databaseName, tableName, onWriteSettled]);

	// The modal routes here only for an edit that removes an attribute; see
	// `removedRecordAttributes`. Shares `isUpdateTableRecordsPending` with the update path, so the
	// editor's Save and Delete stay disabled for either write.
	const onRecordReplace = useCallback((records: Record<string, unknown>[]) => {
		putTableRecords(
			{
				...instanceParams,
				databaseName,
				tableName,
				records,
			},
			{
				onSuccess: (response) => onWriteSettled(describeIncompletePut(response, records.length)),
			},
		);
	}, [putTableRecords, instanceParams, databaseName, tableName, onWriteSettled]);

	const onDeleteRecord = useCallback((hashes: unknown[]) => {
		deleteTableRecords(
			{
				...instanceParams,
				databaseName,
				tableName,
				hashValues: hashes,
			},
			{
				onSuccess: (response) => {
					// `refreshTable` also drops the selection: this record may well be one of the
					// checked rows.
					void refreshTable();
					setIsEditModalOpen(false);
					const incomplete = describeIncompleteDelete(response, hashes.length);
					if (incomplete) {
						toast.error("The record wasn't deleted", { description: incomplete.message });
						return;
					}
					toast.success('Record deleted successfully');
				},
			},
		);
	}, [deleteTableRecords, instanceParams, databaseName, tableName, refreshTable]);

	// Bulk delete from the toolbar. Unlike the editor's single-record delete there is no record in
	// front of the user to check against, so it confirms first; both read the answer the same way.
	const onDeleteSelected = useCallback(() => {
		const hashValues = visibleSelectedKeys;
		if (!hashValues.length) {
			return;
		}
		if (!confirm(`Permanently delete ${pluralize(hashValues.length, 'record', 'records')} from "${tableName}"?`)) {
			return;
		}
		deleteTableRecords(
			{
				...instanceParams,
				databaseName,
				tableName,
				hashValues,
			},
			{
				onSuccess: (response) => {
					// `refreshTable` drops the selection -- these rows are exactly the ones that just
					// changed underneath it.
					void refreshTable();
					const incomplete = describeIncompleteDelete(response, hashValues.length);
					if (incomplete) {
						toast.error("The records weren't all deleted", { description: incomplete.message });
						return;
					}
					toast.success(`${pluralize(hashValues.length, 'record', 'records')} deleted successfully`);
				},
			},
		);
	}, [
		deleteTableRecords,
		instanceParams,
		databaseName,
		tableName,
		refreshTable,
		visibleSelectedKeys,
	]);

	// Point the editor at a record on the page the grid is showing. The row is kept as well as its
	// id because the editor falls back to it when the record can't be fetched by that id.
	const openRecordAt = useCallback((index: number, row: Record<string, unknown>) => {
		const primaryKeyValue = primaryKey ? row[primaryKey] : undefined;
		setClickedRow(row);
		// With no usable primary key there's nothing to look up, so skip the (doomed) fetch; otherwise
		// fetch the fresh record. Either way the modal can fall back to `clickedRow`.
		setSelectedIds(primaryKeyValue == null ? null : [primaryKeyValue]);
		setOpenRowIndex(index);
	}, [primaryKey, setClickedRow, setSelectedIds, setOpenRowIndex]);

	const stepToRecord = useCallback((offset: -1 | 1) => {
		if (openRowIndex === null || !pageRows) {
			return;
		}
		const index = openRowIndex + offset;
		const row = pageRows[index];
		if (row) {
			openRecordAt(index, row);
			return;
		}
		// Off the end of the page: turn the page and open its first/last record once it loads.
		const targetPage = pageIndex + offset;
		if (targetPage < 0) {
			return;
		}
		setPageIndex(targetPage);
		setPendingRecordStep({ end: offset === 1 ? 'first' : 'last', fromPage: pageIndex });
	}, [openRowIndex, pageRows, openRecordAt, pageIndex, setPageIndex]);

	useEffect(function openTheRecordWaitingOnTheNeighbouringPage() {
		if (!pendingRecordStep) {
			return;
		}
		if (!isEditModalOpen) {
			setPendingRecordStep(null);
			return;
		}
		const index = pendingRecordStep.end === 'first' ? 0 : (pageRows?.length ?? 0) - 1;
		const row = index >= 0 ? pageRows?.[index] : undefined;
		if (row) {
			setPendingRecordStep(null);
			openRecordAt(index, row);
			return;
		}
		if (!pageRows && !isPageError) {
			// Still fetching the page the step moved to. Anything else -- an empty page, or a request
			// that failed and (with `retry: false`) will never produce one -- has settled with nothing,
			// so fall through rather than wait for a page that isn't coming.
			return;
		}
		// The step can't complete, so put the grid back where it was and leave the editor on the
		// record it stepped away from, rather than closing it or stranding the grid on a page that
		// holds nothing.
		setPendingRecordStep(null);
		setPageIndex(pendingRecordStep.fromPage);
		if (isPageError) {
			toast.error("Couldn't load the next page of records");
			return;
		}
		if (pendingRecordStep.end === 'first') {
			// An empty page forward is proof there is nothing past the page we came from -- the only
			// proof available when that page was full. Backwards it means something else entirely
			// (records disappeared behind us), so it must not mark that page as the last one.
			setKnownLastPage(pendingRecordStep.fromPage);
			toast.info('This is the last record');
			return;
		}
		toast.info('This is the first record');
	}, [pendingRecordStep, pageRows, isPageError, isEditModalOpen, openRecordAt, setPageIndex, setKnownLastPage]);

	const onRowClick = (rowData: Row<Record<string, unknown>>) => {
		openRecordAt(rowData.index, rowData.original);
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

	const onImportOwnDataClicked = useCallback(() => {
		setWatchedValue('ShowImportData', { databaseName, tableName, method: canImportFile ? 'file' : 'url' });
	}, [databaseName, tableName, canImportFile]);
	const onSeedDataClicked = useCallback(() => {
		setWatchedValue('ShowImportData', { databaseName, tableName, method: 'sample' });
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

	// A step onto another page leaves the open record briefly behind the grid, so the position and
	// the buttons wait for that page rather than describing the record the user stepped away from.
	const recordNavigation: RecordNavigation | undefined = openRowIndex === null ? undefined : {
		position: isStepPending ? undefined : pageIndex * pageSize + openRowIndex + 1,
		// The count describes the whole table, so it only counts the result set when nothing filters it.
		total: useFilteredList ? undefined : totalRecords,
		isTotalEstimated: isEstimatedCount,
		hasPrevious: !isStepPending && (openRowIndex > 0 || pageIndex > 0),
		// A page shorter than `pageSize` is the last page: both list queries page by offset/limit, so
		// a short page means the server had no more rows. That is exact, where `totalRecords` is a
		// whole-table estimate that says nothing about a filtered result set -- using it offered a
		// next record that wasn't there and left the grid on an empty page.
		hasNext: !isStepPending && !!pageRows
			&& (openRowIndex + 1 < pageRows.length
				|| (pageRows.length === pageSize && knownLastPage !== pageIndex)),
		onPrevious: () => stepToRecord(-1),
		onNext: () => stepToRecord(1),
	};

	const [columnSizing, setColumnSizing] = useSessionStorage(
		`ColumnSizing/${databaseName}/${tableName}` as 'ColumnSizing/{database}/{table}',
		{} satisfies ColumnSizingState,
	);

	return (
		<>
			<div className="shrink-0 flex flex-col md:flex-row md:flex-wrap items-center justify-between gap-3 pt-15 pb-4 px-4">
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
					{canDeleteRecords && visibleSelectedKeys.length > 0 && (
						<Button
							variant="destructiveOutline"
							onClick={onDeleteSelected}
							disabled={isDeleteTableRecordsPending}
						>
							<Trash2Icon className="text-destructive" />
							<span>Delete Selected ({visibleSelectedKeys.length})</span>
						</Button>
					)}
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
						<RefreshCwIcon aria-label="Refresh table" />
					</Button>

					<PickColumnsDropdown
						columns={dataTableColumns}
						columnVisibility={columnVisibility}
						setColumnVisibility={setColumnVisibility}
					/>

					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon">
								<EllipsisIcon aria-label="Table options" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent side="bottom" align="end">
							{canImportData && (
								<DropdownMenuItem onClick={onImportDataClicked}>
									<CloudUploadIcon />
									Import Data
								</DropdownMenuItem>
							)}
							<DropdownMenuItem onClick={onExportCSVClicked} disabled={isExportingCSV}>
								<CloudDownloadIcon />
								Export CSV
							</DropdownMenuItem>
							<DropdownMenuSeparator />
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
							{canManageBrowseInstance && <DropdownMenuSeparator />}
							{canDropTable && (
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
				data={pageRows}
				emptyState={
					<EmptyResultSet
						tableName={tableName}
						isFiltered={useFilteredList}
						isPastFirstPage={pageIndex > 0}
						recordCount={totalRecords}
						canImportFile={canImportFile}
						canImportUrl={canImportUrl}
						canSeedSample={canSeedSample}
						canSeedRandom={canSeedRandom}
						canAddRecords={canAddRecords}
						onImport={onImportOwnDataClicked}
						onSeed={onSeedDataClicked}
						onAddRecords={onAddClicked}
						onClearFilters={clearFilters}
					/>
				}
				isFetching={isFetching}
				filtersToggled={filtersToggled}
				columns={dataTableColumns}
				columnVisibility={columnVisibility}
				columnSizing={columnSizing}
				setColumnSizing={setColumnSizing}
				onRowClick={onRowClick}
				onColumnClick={onColumnClick}
				rowSelection={rowSelection}
				totalPages={totalPages}
				totalRecords={totalRecords}
				isEstimatedCount={isEstimatedCount}
				estimatedRange={estimatedRange}
				isExactCountFetching={isExactCountFetching}
				isExactCountError={isExactCountError}
				onRequestExactCount={requestExactCount}
				pageIndex={pageIndex}
				pageSize={pageSize}
				resultSetKey={resultSetKey}
				tableIdentity={tableIdentity}
				columnFiltersForm={columnFiltersForm}
				applyFilters={applyFilters}
				setPageIndex={setPageIndex}
				setPageSize={setPageSize}
			/>
			<EditTableRowModal
				canEditRecords={canEditRecords}
				canDeleteRecords={canDeleteRecords}
				canReplaceRecords={canReplaceRecords}
				replaceBlockedReason={replaceBlockedReason}
				setIsModalOpen={setIsEditModalOpen}
				isModalOpen={isEditModalOpen}
				primaryKey={primaryKey}
				missingPrimaryKey={missingPrimaryKey}
				recordUnavailable={recordUnavailable}
				syntheticAttributes={syntheticAttributes}
				recordNavigation={recordNavigation}
				data={isStepPending
					? undefined
					: missingPrimaryKey || recordUnavailable
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
