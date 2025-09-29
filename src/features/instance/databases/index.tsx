import { Loading } from '@/components/Loading';
import { DatabasesSidebar } from '@/features/instance/databases/components/DatabasesSidebar';
import { Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';

export function DatabasesLayout() {
	return (
		<main className="grid grid-cols-1 gap-4 md:grid-cols-12 min-h-[calc(100vh-theme(spacing.36))]">
			<section className="col-span-1 text-white md:col-span-4 lg:col-span-3">
				<DatabasesSidebar />
			</section>
			<section className="col-span-1 text-white md:col-span-8 lg:col-span-9 flex flex-col">
				<Suspense fallback={<Loading centered text="Loading Data" />}>
					<Outlet />
				</Suspense>
			</section>
		</main>
	);
}
