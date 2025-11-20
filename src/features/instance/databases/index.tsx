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
	const { data: instanceDatabaseMap } = useQuery(getDescribeAllQueryOptions(instanceParams));

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
		return <Navigate to={buildAbsoluteLinkToDatabasePage({
			...params,
			databaseName: newDatabaseName ?? params.databaseName,
			tableName: newTableName,
		})} replace={true} />;
	}

	return (
		<main className="grid grid-cols-1 gap-4 md:grid-cols-12 min-h-[calc(100vh-theme(spacing.36))]">
			<section className="col-span-1 text-white md:col-span-4 lg:col-span-3">
				<DatabasesSidebar instanceDatabaseMap={instanceDatabaseMap} />
			</section>
			<section className="col-span-1 text-white md:col-span-8 lg:col-span-9 flex flex-col">
				{params.databaseName && params.tableName && <DatabaseTableView
					instanceDatabaseMap={instanceDatabaseMap}
					databaseName={params.databaseName}
					tableName={params.tableName}
				/>}
			</section>
		</main>
	);
}
