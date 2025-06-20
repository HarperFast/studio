import { Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import { Loading } from '@/components/Loading';

export function ConfigIndex() {
	return (
		<main className="grid grid-cols-1 gap-4 md:grid-cols-12">
			<section className="col-span-1 text-white md:col-span-4 lg:col-span-3">
				<h2>Config</h2>
				<ul>
					<li>User Management</li>
					<li>Role Management</li>
					<li>Components</li>
				</ul>
			</section>
			<section className="col-span-1 text-white md:col-span-8 lg:col-span-9">
				<Suspense
					fallback={
						<Loading className="flex flex-col items-center justify-center h-full" text="Loading..." />
					}
				>
					<Outlet />
				</Suspense>
			</section>
		</main>
	);
}
