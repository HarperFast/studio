import { Loading } from '@/components/Loading';
import { BrowseSidebar } from '@/features/instance/browse/components/BrowseSidebar';
import { getRouteApi, Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';

const route = getRouteApi('');

export function Browse() {
	const { databaseName, tableName }: { databaseName?: string; tableName?: string; } = route.useParams();

	return (
		<main className="grid grid-cols-1 gap-4 md:grid-cols-12 min-h-[calc(100vh-theme(spacing.36))]">
			<section className="col-span-1 text-white md:col-span-4 lg:col-span-3">
				<BrowseSidebar />
			</section>
			<section className="col-span-1 text-white md:col-span-8 lg:col-span-9 flex flex-col">
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
							<Loading centered text="Loading Data Table" />
						}
					>
						<Outlet />
					</Suspense>
				)}
			</section>
		</main>
	);
}
