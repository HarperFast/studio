import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { getSchemaRelationshipsQueryOptions } from '@/features/instance/databases/functions/schemaRelationships';
import { AddTableRowModal } from '@/features/instance/databases/modals/AddTableRowModal';
import { CreateNewTableModal } from '@/features/instance/databases/modals/CreateNewTableModal';
import { DeleteDatabaseModal } from '@/features/instance/databases/modals/DeleteDatabaseModal';
import { DeleteTableModal } from '@/features/instance/databases/modals/DeleteTableModal';
import { ImportDataModal } from '@/features/instance/databases/modals/ImportDataModal';
import { InstanceDatabaseMap, InstanceTable } from '@/integrations/api/api.patch';
import { getDescribeTable } from '@/integrations/api/instance/database/getDescribeTable';
import { awaitDatabaseMapRefresh } from '@/integrations/api/instance/database/importData';
import { setWatchedValue, useWatchedValue } from '@/lib/events/watcher';
import { WatchedValuesTypeMap } from '@/lib/storage/watchedValueKeys';
import { buildAbsoluteLinkToDatabasePage } from '@/lib/urls/buildAbsoluteLinkToDatabasePage';
import { describeError } from '@/react-query/queryClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useRouter } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

type AddTarget = Exclude<WatchedValuesTypeMap['ShowAddTableRecords'], false>;

/**
 * Single, always-mounted home for every database/table action modal. The tree context menu and the
 * right-pane toolbar both fire the same target-carrying watched values (see `watchedValueKeys.ts`), so
 * an action can target ANY database/table -- not just the currently-open one -- and there is exactly
 * one instance of each modal. Mounted unconditionally by the Databases page (once the map loads) so
 * Drop Database / Create Table work even when no table is open or a database is empty.
 */
export function DatabaseActionModals({ instanceDatabaseMap }: { instanceDatabaseMap?: InstanceDatabaseMap }) {
	const params: {
		clusterId?: string;
		instanceId?: string;
		organizationId?: string;
		databaseName?: string;
		tableName?: string;
	} = useParams({ strict: false });
	const navigate = useNavigate();
	const router = useRouter();
	const queryClient = useQueryClient();
	const instanceParams = useInstanceClientIdParams();

	const goToTable = useCallback((databaseName?: string, tableName?: string) => {
		void navigate({ to: buildAbsoluteLinkToDatabasePage({ ...params, databaseName, tableName }) });
	}, [navigate, params]);

	const { value: createTarget } = useWatchedValue('ShowCreateTable', false);
	const { value: addTarget } = useWatchedValue('ShowAddTableRecords', false);
	const { value: importTarget } = useWatchedValue('ShowImportData', false);

	// A schema-declared relationship can be reported by describe as a plain attribute, and a record
	// that assigns it is refused. Fetched only while a modal that writes records is open: the crawl
	// reads every component schema file, and the open table view has usually cached it already.
	const { data: schemaRelationshipMap } = useQuery(
		getSchemaRelationshipsQueryOptions({ ...instanceParams, enabled: !!addTarget || !!importTarget }),
	);

	const addTableFromMap = addTarget
		? instanceDatabaseMap?.[addTarget.databaseName]?.[addTarget.tableName]
		: undefined;
	const [describedAddTable, setDescribedAddTable] = useState<{ target: AddTarget; table: InstanceTable }>();
	const addInstanceTable = addTableFromMap
		?? (addTarget && describedAddTable?.target === addTarget ? describedAddTable.table : undefined);
	// A target the map lacks may only mean the map is stale. Described directly, not through the cached
	// query, so a copy from before a drop can't open it and a failure is reported once, here, rather
	// than again by the global query-error toast.
	useEffect(() => {
		if (!addTarget || addTableFromMap) {
			return;
		}
		const { databaseName, tableName } = addTarget;
		let isCurrent = true;
		const loadingToast = toast.loading(`Opening "${tableName}"…`);
		getDescribeTable({ ...instanceParams, databaseName, tableName, includeComputed: true }).then(
			(table) => {
				if (isCurrent) {
					toast.dismiss(loadingToast);
					setDescribedAddTable({ target: addTarget, table });
				}
			},
			(error: unknown) => {
				if (isCurrent) {
					toast.dismiss(loadingToast);
					toast.error(`Couldn't open "${tableName}"`, { description: describeError(error).message });
					setWatchedValue('ShowAddTableRecords', false);
				}
			},
		);
		return () => {
			isCurrent = false;
			toast.dismiss(loadingToast);
		};
	}, [addTarget, addTableFromMap, instanceParams]);

	const onImported = useCallback(async (databaseName: string, tableName: string) => {
		await awaitDatabaseMapRefresh(queryClient, instanceParams.entityId);
		goToTable(databaseName, tableName);
		await router.invalidate();
	}, [queryClient, instanceParams.entityId, goToTable, router]);

	// After a drop, only navigate when the dropped entity is the one currently open -- dropping some
	// other tree item just needs the `describe_all` invalidation (done by the modal) to rebuild the tree.
	const onTableDropped = useCallback(({ databaseName, tableName }: { databaseName: string; tableName: string }) => {
		if (params.databaseName === databaseName && params.tableName === tableName) {
			goToTable(databaseName, undefined); // fall back to the database overview
		}
	}, [params.databaseName, params.tableName, goToTable]);
	const onDatabaseDropped = useCallback(({ databaseName }: { databaseName: string }) => {
		if (params.databaseName === databaseName) {
			goToTable(undefined, undefined); // the page re-picks the first remaining database
		}
	}, [params.databaseName, goToTable]);

	return (
		<>
			<CreateNewTableModal
				key={createTarget ? `create-${createTarget.databaseName ?? ''}` : 'create-closed'}
				isModalOpen={!!createTarget}
				setIsModalOpen={open => setWatchedValue('ShowCreateTable', open ? (createTarget || {}) : false)}
				databaseName={createTarget ? createTarget.databaseName : undefined}
				onCreated={goToTable}
			/>
			{addTarget && addInstanceTable && (
				<AddTableRowModal
					key={`add-${addTarget.databaseName}/${addTarget.tableName}`}
					instanceTable={addInstanceTable}
					databaseTables={instanceDatabaseMap?.[addTarget.databaseName]}
					schemaRelationships={schemaRelationshipMap?.[addTarget.databaseName]?.[addTarget.tableName]}
					isModalOpen
					setIsModalOpen={open => {
						if (!open) {
							setWatchedValue('ShowAddTableRecords', false);
						}
					}}
					refreshTable={() =>
						void queryClient.invalidateQueries({
							queryKey: [instanceParams.entityId, addTarget.databaseName, addTarget.tableName],
						})}
				/>
			)}
			<ImportDataModal
				// The method is part of the identity: Seed after Import targets the same table, so without it
				// the modal would reuse the previous launch's mount, and its form state.
				key={importTarget
					? `import-${importTarget.databaseName ?? ''}/${importTarget.tableName ?? ''}/${importTarget.method ?? ''}`
					: 'import-closed'}
				isModalOpen={!!importTarget}
				setIsModalOpen={open => setWatchedValue('ShowImportData', open ? (importTarget || {}) : false)}
				instanceDatabaseMap={instanceDatabaseMap}
				schemaRelationshipMap={schemaRelationshipMap}
				databaseName={importTarget ? importTarget.databaseName : undefined}
				tableName={importTarget ? importTarget.tableName : undefined}
				initialMethod={importTarget ? importTarget.method : undefined}
				onImported={onImported}
			/>
			<DeleteTableModal onDeleted={onTableDropped} />
			<DeleteDatabaseModal onDeleted={onDatabaseDropped} />
		</>
	);
}
