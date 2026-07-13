import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { AddTableRowModal } from '@/features/instance/databases/modals/AddTableRowModal';
import { CreateNewTableModal } from '@/features/instance/databases/modals/CreateNewTableModal';
import { DeleteDatabaseModal } from '@/features/instance/databases/modals/DeleteDatabaseModal';
import { DeleteTableModal } from '@/features/instance/databases/modals/DeleteTableModal';
import { ImportDataModal } from '@/features/instance/databases/modals/ImportDataModal';
import { InstanceDatabaseMap } from '@/integrations/api/api.patch';
import { setWatchedValue, useWatchedValue } from '@/lib/events/watcher';
import { buildAbsoluteLinkToDatabasePage } from '@/lib/urls/buildAbsoluteLinkToDatabasePage';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useRouter } from '@tanstack/react-router';
import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';

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

	const addInstanceTable = addTarget
		? instanceDatabaseMap?.[addTarget.databaseName]?.[addTarget.tableName]
		: undefined;
	// The Add Records modal needs the table's schema from the fast map. If the target isn't there
	// (e.g. a stale map after the table was dropped elsewhere), tell the user instead of silently
	// doing nothing, and clear the trigger.
	useEffect(() => {
		if (addTarget && !addInstanceTable) {
			toast.error(`Couldn't open "${addTarget.tableName}" — it may have just been removed. Try refreshing.`);
			setWatchedValue('ShowAddTableRecords', false);
		}
	}, [addTarget, addInstanceTable]);

	const onImported = useCallback(async (databaseName: string, tableName: string) => {
		// The import may have created a new table (or even database), so refresh the tree too.
		await queryClient.invalidateQueries({
			queryKey: [instanceParams.entityId, 'describe_all'],
			refetchType: 'all',
		});
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
				key={importTarget
					? `import-${importTarget.databaseName ?? ''}/${importTarget.tableName ?? ''}`
					: 'import-closed'}
				isModalOpen={!!importTarget}
				setIsModalOpen={open => setWatchedValue('ShowImportData', open ? (importTarget || {}) : false)}
				instanceDatabaseMap={instanceDatabaseMap}
				databaseName={importTarget ? importTarget.databaseName : undefined}
				tableName={importTarget ? importTarget.tableName : undefined}
				onImported={onImported}
			/>
			<DeleteTableModal onDeleted={onTableDropped} />
			<DeleteDatabaseModal onDeleted={onDatabaseDropped} />
		</>
	);
}
