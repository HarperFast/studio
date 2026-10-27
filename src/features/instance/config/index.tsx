import { Loading } from '@/components/Loading';
import { isLocalStudio } from '@/config/constants';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { ExtensionIcon } from '@/features/instance/extensions/ExtensionIcon';
import { useVisibleExtensionPages } from '@/features/instance/extensions/useStudioExtensions';
import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import { supportsTrustPolicies } from '@/integrations/api/instance/oidcTrust/oidcTrust';
import { RegistrationInfoResponse } from '@/integrations/api/instance/status/getRegistrationInfo';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, Outlet, useLoaderData, useLocation, useParams } from '@tanstack/react-router';
import {
	BadgeCheckIcon,
	GlobeIcon,
	HandshakeIcon,
	KeyIcon,
	LockIcon,
	PieChartIcon,
	RocketIcon,
	ShieldCheckIcon,
	UsersIcon,
} from 'lucide-react';
import { ReactNode, Suspense } from 'react';

interface ConfigMenuEntry {
	name: string;
	/** Relative to the entity, e.g. `config/roles`. */
	page: string;
	icon: ReactNode;
}

const sharedClasses = 'flex items-center p-2 rounded-lg group';
const inactiveProps = { className: 'text-foreground hover:bg-accent dark:text-white dark:hover:bg-gray-700' };
const activeProps = { className: 'text-black bg-white pointer-events-none cursor-default' };

export function ConfigIndex() {
	const params: {
		clusterId?: string;
		instanceId?: string;
		organizationId?: string;
	} = useParams({ strict: false });
	const { version }: RegistrationInfoResponse = useLoaderData({ strict: false });
	const certsAvailable = wasAReleasedBeforeB('4.6.0', version);
	const deploymentsAvailable = wasAReleasedBeforeB('5.1.0', version);
	// The hdb_secret store and its operations (list_secrets / set_secret / …) ship in Harper 5.2
	// (harper#1554). Floor at the earliest 5.2 prerelease so alpha/beta dev builds pass too — a
	// plain '5.2.0' gate would exclude every prerelease (SemVer ranks prereleases below the release).
	const secretsSupported = wasAReleasedBeforeB('5.2.0-alpha.1', version);
	const trustPoliciesSupported = supportsTrustPolicies(version);

	const { clusterId } = params;
	const canManage = useInstanceManagePermission();
	const { pathname } = useLocation();
	const { data: cluster } = useQuery(
		getClusterInfoQueryOptions(clusterId, false),
	);
	const isSelfManaged = cluster === undefined || clusterIsSelfManaged(cluster);

	// Overview lives at the top (rendered by the nav bars below). Everything else — the built-in entries and
	// any a cluster's components add — is sorted by name, so a component's entry lands where a reader
	// expects it rather than at the end.
	const extensionEntries = useVisibleExtensionPages('config');
	const entries: ConfigMenuEntry[] = [
		...(canManage
			? [
				certsAvailable && { name: 'Certificates', page: 'config/certificates', icon: <ShieldCheckIcon /> },
				deploymentsAvailable && { name: 'Deployments', page: 'config/deployments', icon: <RocketIcon /> },
				!isLocalStudio && !isSelfManaged && { name: 'Domains', page: 'config/domains', icon: <GlobeIcon /> },
				{ name: 'Roles', page: 'config/roles', icon: <HandshakeIcon /> },
				// Secrets (the replicated hdb_secret store): any instance or cluster on a supported version — key
				// custody may be file-based (self-hosted) or injected (Fabric). Manage-gated like every built-in
				// entry; the secret operations are additionally super_user-only server-side, so a deep-link by a
				// lesser role lists nothing.
				secretsSupported && { name: 'Secrets', page: 'config/secrets', icon: <LockIcon /> },
				certsAvailable && { name: 'SSH Keys', page: 'config/ssh-keys', icon: <KeyIcon /> },
				trustPoliciesSupported && { name: 'Trust Policies', page: 'config/trust-policies', icon: <BadgeCheckIcon /> },
				{ name: 'Users', page: 'config/users', icon: <UsersIcon /> },
			].filter(excludeFalsy)
			: []),
		...extensionEntries.map((extension) => ({
			name: extension.name,
			page: `config/ext/${extension.key}`,
			icon: <ExtensionIcon name={extension.icon} />,
		})),
	].sort((a, b) => a.name.localeCompare(b.name));

	const children = entries.length > 0 && (
		<>
			{entries.map((entry) => (
				<li key={entry.page}>
					<Link
						to={buildAbsoluteLinkToPage(params, entry.page)}
						className={sharedClasses}
						inactiveProps={inactiveProps}
						activeProps={activeProps}
					>
						<span className="hidden md:inline-flex">{entry.icon}</span> <span className="ms-3">{entry.name}</span>
					</Link>
				</li>
			))}
		</>
	);

	// A lesser role reaches Config only for a component's entry, and the Overview is a super-user page, so
	// the index opens their first entry instead.
	if (!canManage && entries.length > 0 && pathname === buildAbsoluteLinkToPage(params, 'config')) {
		return <Navigate to={buildAbsoluteLinkToPage(params, entries[0].page)} replace />;
	}

	return (
		<div className="md:grid gap-4 md:grid-cols-12 min-h-[calc(100vh-(--spacing(36))-var(--notification-banner-height))]">
			<section className="col-span-1 text-foreground md:col-span-4 lg:col-span-3 md:border-r border-b md:border-b-0 md:pr-4 border-gray-700">
				<DesktopConfigNavBar params={params} showOverview={canManage}>{children}</DesktopConfigNavBar>
				<MobileConfigNavBar params={params} showOverview={canManage}>{children}</MobileConfigNavBar>
			</section>
			<section className="col-span-1 text-foreground md:col-span-8 lg:col-span-9 md:pt-4">
				<Suspense fallback={<Loading className="flex flex-col items-center justify-center h-full" text="Loading..." />}>
					<Outlet />
				</Suspense>
			</section>
		</div>
	);
}

function DesktopConfigNavBar({ params, children, showOverview }: {
	params: {
		clusterId?: string;
		instanceId?: string;
		organizationId?: string;
	};
	children: ReactNode;
	showOverview: boolean;
}) {
	return (
		<div className="hidden md:block pl-4 pt-4">
			{showOverview && (
				<Link
					to={buildAbsoluteLinkToPage(params, 'config')}
					className={sharedClasses}
					activeOptions={{ exact: true }}
					inactiveProps={inactiveProps}
					activeProps={activeProps}
				>
					<PieChartIcon className="hidden md:inline-block" /> <span className="ms-3">Overview</span>
				</Link>
			)}

			{children && (
				<ul className={showOverview ? 'border-t border-gray-700 pt-4 mt-4 space-y-2' : 'space-y-2'}>
					{children}
				</ul>
			)}
		</div>
	);
}

function MobileConfigNavBar({ params, children, showOverview }: {
	params: {
		clusterId?: string;
		instanceId?: string;
		organizationId?: string;
	};
	children: ReactNode;
	showOverview: boolean;
}) {
	return (
		<ul className="flex space-x-2 md:hidden py-2 px-4">
			{showOverview && (
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
			)}
			{children}
		</ul>
	);
}
