import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { getDescribeAllQueryOptions } from '@/integrations/api/instance/database/getDescribeAll';
import { buildAbsoluteLinkToDatabasePage } from '@/lib/urls/buildAbsoluteLinkToDatabasePage';
import { useQuery } from '@tanstack/react-query';
import { Navigate, useParams } from '@tanstack/react-router';
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
	// and the selected table's count is fetched separately (see DatabaseTableView) so a slow count never
	// blocks the database tree or the first page of records from appearing.
	const { data: instanceDatabaseMap } = useQuery(
		getDescribeAllQueryOptions({ ...instanceParams, skipRecordCount: true }),
	);

	let newDatabaseName: string | undefined;
	let newTableName: string | undefined;
	if (instanceDatabaseMap) {
		if (!params.databaseName) {
			newDatabaseName = Object.keys(instanceDatabaseMap).sort()[0];
		}
		const databaseName = params.databaseName ?? newDatabaseName;
		if (!params.tableName && databaseName && instanceDatabaseMap[databaseName]) {
			newTableName = Object.keys(instanceDatabaseMap[databaseName]).sort()[0];
		}
	}
	if (newDatabaseName || newTableName) {
		return (
			<Navigate
				to={buildAbsoluteLinkToDatabasePage({
					...params,
					databaseName: newDatabaseName ?? params.databaseName,
					tableName: newTableName,
				})}
				replace={true}
			/>
		);
	}

	return (
		<main className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-start">
			<section className="col-span-1 text-foreground md:col-span-4 lg:col-span-3 flex flex-col min-h-0 md:sticky md:top-32 md:h-[calc(100vh-(--spacing(32)))] md:max-h-[calc(100vh-(--spacing(32)))] overflow-hidden">
				<DatabasesSidebar instanceDatabaseMap={instanceDatabaseMap} />
			</section>
			<section className="col-span-1 text-foreground md:col-span-8 lg:col-span-9 flex flex-col min-h-0">
				{params.databaseName && params.tableName && (
					<DatabaseTableView
						instanceDatabaseMap={instanceDatabaseMap}
						databaseName={params.databaseName}
						tableName={params.tableName}
					/>
				)}
			</section>
		</main>
	);
}
