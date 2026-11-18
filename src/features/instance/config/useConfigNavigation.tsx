import { isLocalStudio } from '@/config/constants';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { anyMemberSupportsBackups } from '@/features/instance/config/backups/backupNodes';
import type { ConfigMenuGroup } from '@/features/instance/config/ConfigNavigation';
import { ExtensionIcon } from '@/features/instance/extensions/ExtensionIcon';
import { extensionPagePath } from '@/features/instance/extensions/extensionPagePath';
import { useVisibleExtensionPages } from '@/features/instance/extensions/useStudioExtensions';
import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import { supportsBackups } from '@/integrations/api/instance/backups/backups';
import { supportsCiDeploy } from '@/integrations/api/instance/ciDeploy/ciDeploy';
import { supportsMcp } from '@/integrations/api/instance/mcp/mcpConfig';
import { supportsModels } from '@/integrations/api/instance/models/models';
import { supportsTrustPolicies } from '@/integrations/api/instance/oidcTrust/oidcTrust';
import { supportsPreviews } from '@/integrations/api/instance/previews/previews';
import { supportsScheduledJobs } from '@/integrations/api/instance/scheduler/scheduler';
import { supportsWaf } from '@/integrations/api/instance/waf/waf';
import { excludeFalsy } from '@/lib/arrays/excludeFalsy';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
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

export function useConfigNavigation(version: string) {
	const params: {
		clusterId?: string;
		instanceId?: string;
		organizationId?: string;
	} = useParams({ strict: false });
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
	const { data: cluster } = useQuery(
		getClusterInfoQueryOptions(clusterId, false),
	);
	const isSelfManaged = cluster === undefined || clusterIsSelfManaged(cluster);
	// On a cluster route `version` is whichever member answered first; the page gates each member on its own.
	const backupsSupported = supportsBackups(version)
		|| (!params.instanceId && anyMemberSupportsBackups(cluster?.instances));

	const configPath = buildAbsoluteLinkToPage(params, 'config');
	const to = (page: string) => buildAbsoluteLinkToPage(params, `config/${page}`);
	const extensionEntries = useVisibleExtensionPages('config')
		.map((extension) => ({
			name: extension.name,
			to: buildAbsoluteLinkToPage(params, extensionPagePath(extension)),
			icon: <ExtensionIcon name={extension.icon} />,
		}))
		.sort((a, b) => a.name.localeCompare(b.name));

	const groups: ConfigMenuGroup[] = [
		...(canManage
			? [
				{ entries: [{ name: 'Overview', to: configPath, icon: <PieChartIcon />, exact: true }] },
				{
					label: 'Infrastructure',
					entries: [
						!isLocalStudio && !isSelfManaged && {
							name: 'Domains',
							to: to('domains'),
							icon: <GlobeIcon />,
							keywords: [
								'domain name',
								'hostname',
								...cluster?.domains?.map(({ domain }) => domain).filter(excludeFalsy) ?? [],
							],
						},
						certsAvailable && { name: 'Certificates', to: to('certificates'), icon: <ShieldCheckIcon /> },
						backupsSupported && { name: 'Backups', to: to('backups'), icon: <DatabaseBackupIcon /> },
					].filter(excludeFalsy),
				},
				{
					label: 'Access & security',
					entries: [
						{ name: 'Users', to: to('users'), icon: <UsersIcon /> },
						{ name: 'Roles', to: to('roles'), icon: <HandshakeIcon /> },
						certsAvailable && { name: 'SSH Keys', to: to('ssh-keys'), icon: <KeyIcon /> },
						secretsSupported && { name: 'Secrets', to: to('secrets'), icon: <LockIcon /> },
						trustPoliciesSupported && { name: 'Trust Policies', to: to('trust-policies'), icon: <BadgeCheckIcon /> },
						wafSupported && { name: 'Firewall', to: to('firewall'), icon: <BrickWallFireIcon /> },
					].filter(excludeFalsy),
				},
				{
					label: 'Deployments & automation',
					entries: [
						deploymentsAvailable && { name: 'Deployments', to: to('deployments'), icon: <RocketIcon /> },
						deployFromGitHubSupported
						&& { name: 'Deploy from GitHub', to: to('deploy-from-github'), icon: <WorkflowIcon /> },
						previewsSupported && { name: 'Previews', to: to('previews'), icon: <GitPullRequestIcon /> },
						scheduledJobsSupported
						&& { name: 'Scheduled Jobs', to: to('scheduled-jobs'), icon: <CalendarClockIcon /> },
					].filter(excludeFalsy),
				},
				{
					label: 'AI & integrations',
					entries: [
						modelsSupported && { name: 'AI Models', to: to('ai-models'), icon: <SparklesIcon /> },
						mcpSupported && { name: 'MCP Server', to: to('mcp'), icon: <PlugIcon /> },
					].filter(excludeFalsy),
				},
			]
			: []),
		{ label: 'Components', entries: extensionEntries },
	].filter(({ entries }) => entries.length > 0);

	return { groups, configPath, firstExtension: extensionEntries[0]?.to, canManage };
}
