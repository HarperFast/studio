import { InstanceSchemaMap } from '@/lib/api.patch';
import { Suspense, useCallback, useMemo } from 'react';
import { getRouteApi, Outlet, useNavigate, useRouter } from '@tanstack/react-router';
import { Loading } from '@/components/Loading';
import { BrowseSidebar } from '@/features/instance/browse/components/BrowseSidebar';

const route = getRouteApi('');

export function Browse() {
	const router = useRouter();
	const navigate = useNavigate();
	const { schemaName, tableName } = route.useParams();
	const structure = route.useLoaderData() as InstanceSchemaMap;

	const { databaseList, tables } = useMemo(() => {
		const databaseList = Object.keys(structure || {}).sort();
		const tables = schemaName ? Object.keys(structure[schemaName] || []).sort() : [];
		return {
			databaseList,
			tables,
		};
	}, [structure, schemaName]);

	const onSelectDatabase = useCallback((newSchemaName: string | undefined) => {
		const tables = newSchemaName ? Object.keys(structure[newSchemaName] || []).sort() : [];
		const parts = [schemaName ? '..' : '', tableName ? '..' : '', newSchemaName, tables[0]].filter(Boolean);
		if (!schemaName) {
			router.invalidate();
		} else {
			void navigate({ to: parts.join('/') });
		}
	}, [structure, schemaName, tableName, router, navigate]);

	const onSelectTable = useCallback((newTableName: string | undefined) => {
		const parts = [tableName ? '..' : '', newTableName].filter(Boolean);
		void navigate({ to: parts.join('/') });
	}, [tableName, navigate]);

	return (
		<main className="grid grid-cols-1 gap-4 md:grid-cols-12 min-h-[calc(100vh-theme(spacing.36))]">
			<section className="col-span-1 text-white md:col-span-4 lg:col-span-3">
				<BrowseSidebar
					databases={databaseList}
					onSelectDatabase={onSelectDatabase}
					onSelectTable={onSelectTable}
					tables={tables}
				/>
			</section>
			<section className="col-span-1 text-white md:col-span-8 lg:col-span-9">
				{!schemaName ? (
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
