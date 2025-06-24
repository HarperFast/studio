import { Suspense, useState } from 'react';
import { getRouteApi, Outlet, useNavigate } from '@tanstack/react-router';
import { useSuspenseQuery } from '@tanstack/react-query';
import { getDescribeAllQueryOptions } from '@/features/instance/operations/queries/getDescribeAll';
import {
	buildInstanceDataStructure,
} from '@/features/instance/browse/functions/buildInstanceDataStructure';
import { Loading } from '@/components/Loading';
import { BrowseSidebar as BrowseSideBar } from '@/features/instance/browse/components/BrowseSideBar';

const route = getRouteApi('');

const getTableList = (structure: Record<string, unknown>, selectedDatabase: string) => {
	return Object.keys(structure?.[selectedDatabase] || []);
};

export function Browse() {
	const navigate = useNavigate();
	const { organizationId, clusterId, instanceId, schemaName, tableName } = route.useParams();
	const { data: describeAllQueryData } = useSuspenseQuery(getDescribeAllQueryOptions(instanceId));
	const structure = buildInstanceDataStructure(describeAllQueryData);

	const [selectedDatabase, setSelectedDatabase] = useState<string | undefined>(schemaName);
	const [selectedTable, setSelectedTable] = useState<string | undefined>(tableName);
	const databaseList = Object.keys(structure || {});
	// @ts-expect-error unsure how to fix this error 🤔. Would love some insight
	let tables = Object.keys(structure[selectedDatabase] || []);

	const onSelectDatabase = (databaseName: string) => {
		setSelectedDatabase(databaseName);
		navigate({
			to: `/orgs/$organizationId/clusters/$clusterId/instance/$instanceId/browse/$schemaName`,
			params: {
				organizationId: organizationId,
				clusterId: clusterId,
				instanceId: instanceId,
				schemaName: databaseName,
			},
		});
		tables = getTableList(structure, databaseName);
	};

	const onSelectTable = (tableName: string) => {
		setSelectedTable(tableName);
	};

	return (
		<main className="grid grid-cols-1 gap-4 md:grid-cols-12 min-h-[calc(100vh-theme(spacing.36))]">
			<section className="col-span-1 text-white md:col-span-4 lg:col-span-3">
				<BrowseSideBar
					databases={databaseList}
					onSelectDatabase={onSelectDatabase}
					selectedDatabase={selectedDatabase}
					tables={tables}
					onSelectTable={onSelectTable}
				/>
			</section>
			<section className="col-span-1 text-white md:col-span-8 lg:col-span-9">
				{!selectedDatabase ? (
					<div className="flex items-center justify-center h-full">
						<p className="pt-2 text-sm text-center">Please select a database.</p>
					</div>
				) : !selectedTable ? (
					<div className="flex items-center justify-center h-full">
						<p className="pt-2 text-sm text-center">Please select a table.</p>
					</div>
				) : (
					<Suspense
						fallback={
							<Loading className="flex flex-col items-center justify-center h-full" text="Loading Data Table" />
						}
					>
						<Outlet />
					</Suspense>
				)}
			</section>
		</main>
	);
}
