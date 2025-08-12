import { InstanceDatabaseMap } from '@/lib/api.patch';
import { Suspense, useCallback, useMemo } from 'react';
import { getRouteApi, Outlet, useNavigate, useRouter } from '@tanstack/react-router';
import { Loading } from '@/components/Loading';
import { BrowseSidebar } from '@/features/instance/browse/components/BrowseSidebar';

const route = getRouteApi('');

export function Browse() {
	const router = useRouter();
	const navigate = useNavigate();
	const { databaseName, tableName } = route.useParams();
	const structure = route.useLoaderData() as InstanceDatabaseMap;

	const { databaseNames, tableNames } = useMemo(() => {
		const databaseNames = Object.keys(structure || {}).sort();
		const tableNames = databaseName ? Object.keys(structure[databaseName] || []).sort() : [];
		return {
			databaseNames,
			tableNames,
		};
	}, [structure, databaseName]);

	const onSelectDatabase = useCallback((newDatabaseName: string | undefined) => {
		const tableNames = newDatabaseName ? Object.keys(structure[newDatabaseName] || []).sort() : [];
		const parts = [databaseName ? '..' : '', tableName ? '..' : '', newDatabaseName, tableNames[0]].filter(Boolean);
		if (!databaseName) {
			router.invalidate();
		} else {
			void navigate({ to: parts.join('/') });
		}
	}, [structure, databaseName, tableName, router, navigate]);

	const onSelectTable = useCallback((newTableName: string | undefined) => {
		const parts = [tableName ? '..' : '', newTableName].filter(Boolean);
		void navigate({ to: parts.join('/') });
	}, [tableName, navigate]);

	return (
		<main className="grid grid-cols-1 gap-4 md:grid-cols-12 min-h-[calc(100vh-theme(spacing.36))]">
			<section className="col-span-1 text-white md:col-span-4 lg:col-span-3">
				<BrowseSidebar
					databaseNames={databaseNames}
					onSelectDatabase={onSelectDatabase}
					onSelectTable={onSelectTable}
					tableNames={tableNames}
				/>
			</section>
			<section className="col-span-1 text-white md:col-span-8 lg:col-span-9">
				{!databaseName ? (
					<div className="flex items-center justify-center h-full">
						<p className="pt-2 text-sm text-center">Please select a database.</p>
					</div>
				) : !tableName ? (
					<div className="flex items-center justify-center h-full">
						<p className="pt-2 text-sm text-center">Please select a table.</p>
					</div>
				) : (
					<Suspense
						fallback={
							<Loading className="flex flex-col items-center justify-center h-full"
									 text="Loading Data Table" />
						}
					>
						<Outlet />
					</Suspense>
				)}
			</section>
		</main>
	);
}
