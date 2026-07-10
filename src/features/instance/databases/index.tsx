import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { getDescribeAllQueryOptions } from '@/integrations/api/instance/database/getDescribeAll';
import { buildAbsoluteLinkToDatabasePage } from '@/lib/urls/buildAbsoluteLinkToDatabasePage';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useParams } from '@tanstack/react-router';
import { DatabaseActionModals } from './components/DatabaseActionModals';
import { DatabaseOverview } from './components/DatabaseOverview';
import { DatabasesSidebar } from './components/DatabasesSidebar';
import { DatabaseTableView } from './components/DatabaseTableView';

export function Databases() {
	const params: {
		clusterId?: string;
		instanceId?: string;
		databaseName?: string;
		tableName?: string;
	} = useParams({ strict: false });

	const instanceParams = useInstanceClientIdParams();
	// Skip the per-table record-count scan here: the sidebar and table view only need schema to render,
	// and the selected table's count is fetched separately (see DatabaseTableView / DatabaseOverview) so
	// a slow count never blocks the database tree or the first page of records from appearing.
	const { data: instanceDatabaseMap } = useQuery(
		getDescribeAllQueryOptions({ ...instanceParams, skipRecordCount: true }),
	);

	if (instanceDatabaseMap) {
		// Land on the first database's overview when nothing is selected, and recover from a stale link to
		// a database that no longer exists (e.g. just dropped) by falling back to the first one.
		const databaseExists = params.databaseName && instanceDatabaseMap[params.databaseName];
		if (!databaseExists) {
			const firstDatabaseName = Object.keys(instanceDatabaseMap).sort()[0];
			if (firstDatabaseName && firstDatabaseName !== params.databaseName) {
				return (
					<Navigate
						to={buildAbsoluteLinkToDatabasePage({ ...params, databaseName: firstDatabaseName, tableName: undefined })}
						replace={true}
					/>
				);
			}
		} else if (params.tableName && !instanceDatabaseMap[params.databaseName!][params.tableName]) {
			// Database exists but the table doesn't (stale link / dropped table): show the DB overview.
			return (
				<Navigate
					to={buildAbsoluteLinkToDatabasePage({ ...params, tableName: undefined })}
					replace={true}
				/>
			);
		}
	}

	return (
		<>
			<main className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-start">
				<section className="col-span-1 text-foreground md:col-span-4 lg:col-span-3 flex flex-col min-h-0 md:sticky md:top-32 md:h-[calc(100vh-(--spacing(32)))] md:max-h-[calc(100vh-(--spacing(32)))] overflow-hidden">
					<DatabasesSidebar instanceDatabaseMap={instanceDatabaseMap} />
				</section>
				<section className="col-span-1 text-foreground md:col-span-8 lg:col-span-9 flex flex-col min-h-0">
					{params.databaseName && params.tableName
						? (
							<DatabaseTableView
								instanceDatabaseMap={instanceDatabaseMap}
								databaseName={params.databaseName}
								tableName={params.tableName}
							/>
						)
						: params.databaseName
						? (
							<DatabaseOverview
								instanceDatabaseMap={instanceDatabaseMap}
								databaseName={params.databaseName}
							/>
						)
						: null}
				</section>
			</main>
			{instanceDatabaseMap && <DatabaseActionModals instanceDatabaseMap={instanceDatabaseMap} />}
		</>
	);
}
