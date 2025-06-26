import { Link, Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';
import { Loading } from '@/components/Loading';
import { Handshake, PieChartIcon, Users } from 'lucide-react';

const sharedClasses = 'flex items-center p-2 rounded-lg group';
const inactiveProps = { className: 'text-white hover:bg-gray-700' };
const activeProps = { className: 'text-black bg-white pointer-events-none cursor-default' };

export function ConfigIndex() {
	return (<div className="grid grid-cols-1 gap-4 md:grid-cols-12 min-h-[calc(100vh-theme(spacing.36))]">
		<section className="col-span-1 text-white md:col-span-4 lg:col-span-3 border-r-1 pr-4 border-gray-700">
			<Link to={``} className={sharedClasses}
						activeOptions={{ exact: true }} inactiveProps={inactiveProps} activeProps={activeProps}>
				<PieChartIcon className="inline-block" /> <span className="ms-3">Instance Overview</span>
			</Link>

			<ul className="border-t border-gray-700 pt-4 mt-4 space-y-2">
				<li>
					<Link to={`users`}
								className={sharedClasses} inactiveProps={inactiveProps} activeProps={activeProps}>
						<Users className="inline-block" /> <span className="ms-3">Users</span>
					</Link>
				</li>
				<li>
					<Link to={`roles`}
								className={sharedClasses} inactiveProps={inactiveProps} activeProps={activeProps}>
						<Handshake className="inline-block" /> <span className="ms-3">Roles</span>
					</Link>
				</li>
			</ul>
		</section>
		<section className="col-span-1 text-white md:col-span-8 lg:col-span-9">
			<Suspense fallback={<Loading className="flex flex-col items-center justify-center h-full" text="Loading..." />}>
				<Outlet />
			</Suspense>
		</section>
	</div>);
}
