import { Loading } from '@/components/Loading';
import { isLocalStudio } from '@/config/constants';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { anyMemberSupportsBackups } from '@/features/instance/config/backups/backupNodes';
import { ExtensionIcon } from '@/features/instance/extensions/ExtensionIcon';
import { extensionPagePath } from '@/features/instance/extensions/extensionPagePath';
import { useVisibleExtensionPages } from '@/features/instance/extensions/useStudioExtensions';
import { useInstanceOperationAccess } from '@/hooks/useInstanceOperationPermission';
import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import { supportsBackups } from '@/integrations/api/instance/backups/backups';
import { supportsCiDeploy } from '@/integrations/api/instance/ciDeploy/ciDeploy';
import { supportsMcp } from '@/integrations/api/instance/mcp/mcpConfig';
import { supportsModels } from '@/integrations/api/instance/models/models';
import { supportsTrustPolicies } from '@/integrations/api/instance/oidcTrust/oidcTrust';
import { supportsPreviews } from '@/integrations/api/instance/previews/previews';
import { supportsScheduledJobs } from '@/integrations/api/instance/scheduler/scheduler';
import { RegistrationInfoResponse } from '@/integrations/api/instance/status/getRegistrationInfo';
import { supportsWaf } from '@/integrations/api/instance/waf/waf';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, Outlet, useLoaderData, useLocation, useParams } from '@tanstack/react-router';
import {
	BadgeCheckIcon,
	BrickWallFireIcon,
	CalendarClockIcon,
	DatabaseBackupIcon,
	GitPullRequestIcon,
	GlobeIcon,
	HandshakeIcon,
	KeyIcon,
	LockIcon,
	PieChartIcon,
	PlugIcon,
	RocketIcon,
	ShieldCheckIcon,
	SparklesIcon,
	UsersIcon,
	WorkflowIcon,
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
	const wafSupported = supportsWaf(version);
	const previewsSupported = supportsPreviews(version);
	const deployFromGitHubSupported = supportsCiDeploy(version);
	const scheduledJobsSupported = supportsScheduledJobs(version);
	const modelsSupported = supportsModels(version);
	const mcpSupported = supportsMcp(version);

	const { clusterId } = params;
	const canManage = useInstanceManagePermission();
	const canListDeployments = useInstanceOperationAccess('list_deployments');
	const { pathname } = useLocation();
	const { data: cluster } = useQuery(
		getClusterInfoQueryOptions(clusterId, false),
	);
	const isSelfManaged = cluster === undefined || clusterIsSelfManaged(cluster);
	// On a cluster route `version` is whichever member answered first; the page gates each member on its own.
	const backupsSupported = supportsBackups(version)
		|| (!params.instanceId && anyMemberSupportsBackups(cluster?.instances));

	// Overview lives at the top (rendered by the nav bars below). Everything else — the built-in entries and
	// any a cluster's components add — is sorted by name, so a component's entry lands where a reader
	// expects it rather than at the end.
	const extensionEntries = useVisibleExtensionPages('config');
	const entries: ConfigMenuEntry[] = [
		...(canManage
			? [
				modelsSupported && { name: 'AI Models', page: 'config/ai-models', icon: <SparklesIcon /> },
				backupsSupported && { name: 'Backups', page: 'config/backups', icon: <DatabaseBackupIcon /> },
				certsAvailable && { name: 'Certificates', page: 'config/certificates', icon: <ShieldCheckIcon /> },
				deployFromGitHubSupported
				&& { name: 'Deploy from GitHub', page: 'config/deploy-from-github', icon: <WorkflowIcon /> },
				deploymentsAvailable && { name: 'Deployments', page: 'config/deployments', icon: <RocketIcon /> },
				!isLocalStudio && !isSelfManaged && { name: 'Domains', page: 'config/domains', icon: <GlobeIcon /> },
				wafSupported && { name: 'Firewall', page: 'config/firewall', icon: <BrickWallFireIcon /> },
				mcpSupported && { name: 'MCP Server', page: 'config/mcp', icon: <PlugIcon /> },
				previewsSupported && { name: 'Previews', page: 'config/previews', icon: <GitPullRequestIcon /> },
				{ name: 'Roles', page: 'config/roles', icon: <HandshakeIcon /> },
				scheduledJobsSupported
				&& { name: 'Scheduled Jobs', page: 'config/scheduled-jobs', icon: <CalendarClockIcon /> },
				// Secrets (the replicated hdb_secret store): any instance or cluster on a supported version — key
				// custody may be file-based (self-hosted) or injected (Fabric). Manage-gated like every built-in
				// entry; the secret operations are additionally super_user-only server-side, so a deep-link by a
				// lesser role lists nothing.
				secretsSupported && { name: 'Secrets', page: 'config/secrets', icon: <LockIcon /> },
				certsAvailable && { name: 'SSH Keys', page: 'config/ssh-keys', icon: <KeyIcon /> },
				trustPoliciesSupported && { name: 'Trust Policies', page: 'config/trust-policies', icon: <BadgeCheckIcon /> },
				{ name: 'Users', page: 'config/users', icon: <UsersIcon /> },
			].filter(excludeFalsy)
			// A read-only Fabric Connect session may list deployments and nothing else built in here.
			: canListDeployments && deploymentsAvailable
			? [{ name: 'Deployments', page: 'config/deployments', icon: <RocketIcon /> }]
			: []),
		...extensionEntries.map((extension) => ({
			name: extension.name,
			page: extensionPagePath(extension),
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

	if (!canManage && canListDeployments === undefined) {
		return <Loading centered text="Loading..." />;
	}
	// A lesser role reaches only its entries here: the Overview and every other page run operations only a manager
	// may, so the index or a deep link elsewhere opens their first entry, or leaves Config when they have none,
	// before those queries start. The router matches `config/` to the same index.
	const onEntry = entries.some((entry) => isAtOrUnder(pathname, buildAbsoluteLinkToPage(params, entry.page)));
	if (!canManage && !onEntry) {
		const to = entries.length > 0 ? buildAbsoluteLinkToPage(params, entries[0].page) : buildAbsoluteLinkToPage(params);
		return <Navigate to={to} replace />;
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

function isAtOrUnder(pathname: string, path: string): boolean {
	const at = pathname.replace(/\/+$/, '');
	const base = path.replace(/\/+$/, '');
	return at === base || at.startsWith(`${base}/`);
}
