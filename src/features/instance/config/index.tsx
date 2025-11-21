import { Loading } from '@/components/Loading';
import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { Link, Outlet, useParams } from '@tanstack/react-router';
import { HandshakeIcon, KeyIcon, PieChartIcon, UsersIcon } from 'lucide-react';
import { Suspense } from 'react';

const sharedClasses = 'flex items-center p-2 rounded-lg group';
const inactiveProps = { className: 'text-white hover:bg-gray-700' };
const activeProps = { className: 'text-black bg-white pointer-events-none cursor-default' };

export function ConfigIndex() {
	return (
		<div className="md:grid gap-4 md:grid-cols-12 min-h-[calc(100vh-theme(spacing.36))]">
			<section className="col-span-1 text-white md:col-span-4 lg:col-span-3 md:border-r-1 border-b md:border-b-0 md:pr-4 border-gray-700">
				<DesktopConfigNavBar />
				<MobileConfigNavBar />
			</section>
			<section className="col-span-1 text-white md:col-span-8 lg:col-span-9 md:pt-4">
				<Suspense fallback={
					<Loading className="flex flex-col items-center justify-center h-full" text="Loading..." />}>
					<Outlet />
				</Suspense>
			</section>
		</div>
	);
}

function DesktopConfigNavBar() {
	const params = useParams({ strict: false });
	const canManage = useInstanceManagePermission();

	return (
		<div className="hidden md:block pl-4 pt-4">
			<Link
				to={buildAbsoluteLinkToPage(params, 'config')}
				className={sharedClasses}
				activeOptions={{ exact: true }}
				inactiveProps={inactiveProps}
				activeProps={activeProps}
			>
				<PieChartIcon className="inline-block" /> <span className="ms-3">Overview</span>
			</Link>

			{canManage && <ul className="border-t border-gray-700 pt-4 mt-4 space-y-2">
				<li>
					<Link to={buildAbsoluteLinkToPage(params, 'config/users')} className={sharedClasses} inactiveProps={inactiveProps} activeProps={activeProps}>
						<UsersIcon className="inline-block" /> <span className="ms-3">Users</span>
					</Link>
				</li>
				<li>
					<Link to={buildAbsoluteLinkToPage(params, 'config/roles')} className={sharedClasses} inactiveProps={inactiveProps} activeProps={activeProps}>
						<HandshakeIcon className="inline-block" /> <span className="ms-3">Roles</span>
					</Link>
				</li>
				<li>
					<Link to={buildAbsoluteLinkToPage(params, 'config/ssh-keys')} className={sharedClasses} inactiveProps={inactiveProps} activeProps={activeProps}>
						<KeyIcon className="inline-block" /> <span className="ms-3">SSH Keys</span>
					</Link>
				</li>
			</ul>}
		</div>
	);
}

function MobileConfigNavBar() {
	const params = useParams({ strict: false });
	const canManage = useInstanceManagePermission();

	return (
		<ul className="flex space-x-4 md:hidden py-2 px-4">
			<li>
				<Link
					to={buildAbsoluteLinkToPage(params, 'config')}
					className={sharedClasses}
					activeOptions={{ exact: true }}
					inactiveProps={inactiveProps}
					activeProps={activeProps}
				>
					<PieChartIcon className="inline-block" /> <span className="ms-3">Overview</span>
				</Link>
			</li>
			{canManage && (<>
				<li>
					<Link to={buildAbsoluteLinkToPage(params, 'config/users')} className={sharedClasses} inactiveProps={inactiveProps} activeProps={activeProps}>
						<UsersIcon className="inline-block" /> <span className="ms-3">Users</span>
					</Link>
				</li>
				<li>
					<Link to={buildAbsoluteLinkToPage(params, 'config/roles')} className={sharedClasses} inactiveProps={inactiveProps} activeProps={activeProps}>
						<HandshakeIcon className="inline-block" /> <span className="ms-3">Roles</span>
					</Link>
				</li>
				<li>
					<Link to={buildAbsoluteLinkToPage(params, 'config/ssh-keys')} className={sharedClasses} inactiveProps={inactiveProps} activeProps={activeProps}>
						<KeyIcon className="inline-block" /> <span className="ms-3">SSH Keys</span>
					</Link>
				</li>
			</>)}
		</ul>
	);
}
