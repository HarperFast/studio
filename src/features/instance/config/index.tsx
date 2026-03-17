import { Loading } from '@/components/Loading';
import { isLocalStudio } from '@/config/constants';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import { RegistrationInfoResponse } from '@/integrations/api/instance/status/getRegistrationInfo';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { useQuery } from '@tanstack/react-query';
import { Link, Outlet, useLoaderData, useParams } from '@tanstack/react-router';
import { GlobeIcon, HandshakeIcon, KeyIcon, PieChartIcon, ShieldCheckIcon, UsersIcon } from 'lucide-react';
import { ReactNode, Suspense } from 'react';

const sharedClasses = 'flex items-center p-2 rounded-lg group';
const inactiveProps = { className: 'text-white hover:bg-gray-700' };
const activeProps = { className: 'text-black bg-white pointer-events-none cursor-default' };

export function ConfigIndex() {
	const params: {
		clusterId?: string;
		instanceId?: string;
		organizationId?: string;
	} = useParams({ strict: false });
	const { version }: RegistrationInfoResponse = useLoaderData({ strict: false });
	const certsAvailable = wasAReleasedBeforeB('4.6.0', version);

	const { clusterId } = params;
	const canManage = useInstanceManagePermission();
	const { data: cluster } = useQuery(
		getClusterInfoQueryOptions(clusterId, false),
	);
	const isSelfManaged = cluster === undefined || clusterIsSelfManaged(cluster);

	const children = canManage && (
		<>
			<li>
				<Link
					to={buildAbsoluteLinkToPage(params, 'config/users')}
					className={sharedClasses}
					inactiveProps={inactiveProps}
					activeProps={activeProps}
				>
					<UsersIcon className="hidden md:inline-block" /> <span className="ms-3">Users</span>
				</Link>
			</li>
			<li>
				<Link
					to={buildAbsoluteLinkToPage(params, 'config/roles')}
					className={sharedClasses}
					inactiveProps={inactiveProps}
					activeProps={activeProps}
				>
					<HandshakeIcon className="hidden md:inline-block" /> <span className="ms-3">Roles</span>
				</Link>
			</li>
			{certsAvailable && (
				<li>
					<Link
						to={buildAbsoluteLinkToPage(params, 'config/certificates')}
						className={sharedClasses}
						inactiveProps={inactiveProps}
						activeProps={activeProps}
					>
						<ShieldCheckIcon className="hidden md:inline-block" /> <span className="ms-3">Certificates</span>
					</Link>
				</li>
			)}
			{!isLocalStudio && !isSelfManaged && (
				<li>
					<Link
						to={buildAbsoluteLinkToPage(params, 'config/domains')}
						className={sharedClasses}
						inactiveProps={inactiveProps}
						activeProps={activeProps}
					>
						<GlobeIcon className="hidden md:inline-block" /> <span className="ms-3">Domains</span>
					</Link>
				</li>
			)}
			{certsAvailable && (
				<li>
					<Link
						to={buildAbsoluteLinkToPage(params, 'config/ssh-keys')}
						className={sharedClasses}
						inactiveProps={inactiveProps}
						activeProps={activeProps}
					>
						<KeyIcon className="hidden md:inline-block" /> <span className="ms-3">SSH Keys</span>
					</Link>
				</li>
			)}
		</>
	);

	return (
		<div className="md:grid gap-4 md:grid-cols-12 min-h-[calc(100vh-(--spacing(36)))]">
			<section className="col-span-1 text-white md:col-span-4 lg:col-span-3 md:border-r border-b md:border-b-0 md:pr-4 border-gray-700">
				<DesktopConfigNavBar params={params}>{children}</DesktopConfigNavBar>
				<MobileConfigNavBar params={params}>{children}</MobileConfigNavBar>
			</section>
			<section className="col-span-1 text-white md:col-span-8 lg:col-span-9 md:pt-4">
				<Suspense fallback={<Loading className="flex flex-col items-center justify-center h-full" text="Loading..." />}>
					<Outlet />
				</Suspense>
			</section>
		</div>
	);
}

function DesktopConfigNavBar({ params, children }: {
	params: {
		clusterId?: string;
		instanceId?: string;
		organizationId?: string;
	};
	children: ReactNode;
}) {
	return (
		<div className="hidden md:block pl-4 pt-4">
			<Link
				to={buildAbsoluteLinkToPage(params, 'config')}
				className={sharedClasses}
				activeOptions={{ exact: true }}
				inactiveProps={inactiveProps}
				activeProps={activeProps}
			>
				<PieChartIcon className="hidden md:inline-block" /> <span className="ms-3">Overview</span>
			</Link>

			{children && (
				<ul className="border-t border-gray-700 pt-4 mt-4 space-y-2">
					{children}
				</ul>
			)}
		</div>
	);
}

function MobileConfigNavBar({ params, children }: {
	params: {
		clusterId?: string;
		instanceId?: string;
		organizationId?: string;
	};
	children: ReactNode;
}) {
	return (
		<ul className="flex space-x-2 md:hidden py-2 px-4">
			<li>
				<Link
					to={buildAbsoluteLinkToPage(params, 'config')}
					className={sharedClasses}
					activeOptions={{ exact: true }}
					inactiveProps={inactiveProps}
					activeProps={activeProps}
				>
					<PieChartIcon className="hidden md:inline-block" /> <span className="ms-3">Overview</span>
				</Link>
			</li>
			{children}
		</ul>
	);
}
