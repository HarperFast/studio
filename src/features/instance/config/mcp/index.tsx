import { Loading } from '@/components/Loading';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { deletedClusterStatuses } from '@/config/clusterStatuses';
import { isLocalStudio, localStudioDevUrl } from '@/config/constants';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { PageNotice } from '@/features/instance/config/previews/PageNotice';
import { useInstanceManagePermission } from '@/hooks/usePermissions';
import { useRollingConfigUpdate } from '@/hooks/useRollingConfigUpdate';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import {
	buildMcpConfigWrite,
	draftFromMcpState,
	MCP_MIN_VERSION,
	McpDraft,
	McpPart,
	McpState,
	readMcpState,
	sameMcpCommandAccess,
	supportsMcp,
	supportsMcpEnabledFlag,
	writeMcpCommandList,
} from '@/integrations/api/instance/mcp/mcpConfig';
import { getConfigurationQueryOptions } from '@/integrations/api/instance/status/getConfiguration';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { compareVersions } from '@/lib/string/wasAReleasedBeforeB';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { ReactNode, useCallback, useMemo, useState } from 'react';
import { McpCommandsEditor } from './McpCommandsEditor';
import { McpConnect } from './McpConnect';
import { localMcpHost, mcpHostForInstance } from './mcpConnection';

/** The `enabled` flag's floor, as the customer reads it: its 5.4 prereleases are not something to send them to. */
const DISABLE_NEEDS = 'Harper 5.4 or later';

/** Keyed on the entity, so a draft, a pending confirmation or a running save never carries over to another one. */
export function ConfigMcpIndex() {
	const { entityId } = useInstanceClientIdParams();
	return <McpServerPage key={entityId} />;
}

function McpServerPage() {
	const { clusterId, instanceId }: { clusterId?: string; instanceId?: string } = useParams({ strict: false });
	const instanceParams = useInstanceClientIdParams();
	const canManage = useInstanceManagePermission();
	// The nav hides this page below 5.1, but a bookmark still lands here.
	const { data: registrationInfo, isError: isVersionError } = useQuery(
		getRegistrationInfoQueryOptions(instanceParams),
	);
	const version = registrationInfo?.version;
	const supported = version === undefined ? undefined : supportsMcp(version);
	const { data: configuration, isError: configFailed } = useQuery({
		...getConfigurationQueryOptions(instanceParams),
		enabled: canManage && supported === true,
	});
	const { data: cluster } = useQuery(getClusterInfoQueryOptions(!isLocalStudio && clusterId, false));

	const [draft, setDraft] = useState<McpDraft | null>(null);
	const [confirming, setConfirming] = useState(false);
	const onRestartedSuccessfully = useCallback(() => setDraft(null), []);
	const { onConfigUpdate, isPending } = useRollingConfigUpdate({
		onRestartedSuccessfully,
		restartOperation: 'restart',
	});

	// The members a save reaches: the whole cluster from a cluster's page, or the one instance from its own.
	const members = useMemo(() => {
		const live = (cluster?.instances ?? []).filter((instance) =>
			!deletedClusterStatuses.includes(instance.status ?? '')
		);
		return instanceId ? live.filter((instance) => instance.id === instanceId) : live;
	}, [cluster, instanceId]);
	// A cluster's save reaches every member, and an older one refuses `enabled` by name, so every member has to
	// report a version that has it; one that reports none counts as without, and a cluster still loading has none.
	const onCluster = instanceParams.entityType === 'cluster' && !isLocalStudio;
	const versions = onCluster ? members.map((instance) => instance.version) : [version];
	const canDisable = versions.length > 0 && versions.every(supportsMcpEnabledFlag);
	const knownVersions = versions.filter((known): known is string => !!known);
	const oldestVersion = [...knownVersions].sort(compareVersions)[0] ?? version;
	const tooOld = members.filter((instance) => instance.version && !supportsMcp(instance.version));

	const hosts = useMemo(
		() =>
			isLocalStudio
				? [localMcpHost(localStudioDevUrl || window.location.origin, configuration?.http)]
				: members
					.map((instance) =>
						mcpHostForInstance(instance, clusterIsSelfManaged(cluster) ? configuration?.http : undefined)
					)
					.filter((host) => host.operationsOrigin),
		[members, configuration, cluster],
	);

	if (!canManage) {
		return <PageNotice>Only super users can view or change the MCP server.</PageNotice>;
	}
	if (supported === undefined) {
		return isVersionError
			? <PageNotice>This instance's Harper version could not be read, so its MCP server is not shown.</PageNotice>
			: <Loading text="Loading..." />;
	}
	if (!supported) {
		return (
			<PageNotice>
				Harper's MCP server needs Harper {MCP_MIN_VERSION} or later. This instance runs {version}.
			</PageNotice>
		);
	}
	if (configFailed) {
		return <PageNotice>This instance's configuration could not be read, so its MCP server is not shown.</PageNotice>;
	}
	if (!configuration || !version) {
		return <Loading text="Loading..." />;
	}

	const saved = readMcpState(configuration, version);
	const current = draft ?? draftFromMcpState(saved);
	let write: Record<string, unknown> | undefined;
	let writeError: string | undefined;
	try {
		write = buildMcpConfigWrite(saved, current, { canDisable });
	} catch (error) {
		writeError = (error as Error).message;
	}
	const unsavedChanges = !!write || !!writeError;
	const update = (next: Partial<McpDraft>) => setDraft({ ...current, ...next });
	// Without the flag a list written while the part is off creates its block on a member, which turns it on there.
	const commandsLocked = !canDisable && !current.operationsOn;
	const scope = instanceParams.entityType === 'cluster' ? 'this cluster' : 'this instance';

	const save = () => {
		setConfirming(false);
		if (write) {
			onConfigUpdate(write);
		}
	};

	return (
		<div className="flex flex-col gap-4 px-4 pb-8 md:px-0">
			<div className="max-w-3xl space-y-1">
				<h2 className="text-lg font-semibold">MCP Server</h2>
				<p className="text-sm text-muted-foreground">
					Harper's built-in Model Context Protocol (MCP) server lets AI tools such as Claude Desktop, Cursor and Zed
					connect to {scope}{' '}
					and use it through tools. An AI tool signs in as a Harper database user, and that user's role limits what it
					can do, the same as for the operations API and REST.
				</p>
				{instanceParams.entityType === 'cluster' && (
					<p className="text-xs italic text-muted-foreground">
						The settings shown are those of one instance in the cluster, whichever the load balancer selected.
					</p>
				)}
				{tooOld.length > 0 && (
					<p className="text-xs text-warning">
						{tooOld.map((instance) => `${instance.name || instance.id} (${instance.version})`).join(', ')}{' '}
						{tooOld.length === 1 ? 'runs' : 'run'} a Harper older than{' '}
						{MCP_MIN_VERSION}, which has no MCP server and will refuse these settings.
					</p>
				)}
			</div>

			<PartCard
				part="operations"
				title="Operations"
				description="Harper's admin commands, as tools, on the operations port. AI tools must sign in."
				saved={saved}
				on={current.operationsOn}
				onChange={(operationsOn) => update({ operationsOn })}
				canDisable={canDisable}
				oldestVersion={oldestVersion}
				disabled={isPending}
			>
				<McpCommandsEditor
					list={current.commands}
					saved={saved.operations}
					onChange={(commands) => update({ commands })}
					version={oldestVersion ?? version}
					disabled={isPending || commandsLocked}
				/>
				{commandsLocked && (
					<p className="mt-2 text-xs text-muted-foreground">
						On Harper{' '}
						{oldestVersion}, saving a command list turns the operations part on, so turn it on to change its commands.
					</p>
				)}
			</PartCard>

			<PartCard
				part="application"
				title="Application"
				description={"Your application's exported tables and resources, as tools, on the application port. Every "
					+ 'exported table and resource is included unless your application turns MCP off for it, and your '
					+ "application's code can add tools of its own."}
				saved={saved}
				on={current.applicationOn}
				onChange={(applicationOn) => update({ applicationOn })}
				canDisable={canDisable}
				oldestVersion={oldestVersion}
				disabled={isPending}
			>
				<p className="text-xs text-warning">
					Turning this on makes every exported table and resource available to AI tools, with the same permissions as
					your application's REST API. An AI tool that doesn't sign in reaches what your application lets anonymous
					users reach.
				</p>
			</PartCard>

			{(write || writeError) && (
				<div className="flex flex-wrap items-center justify-end gap-2">
					{writeError && <p className="mr-auto text-sm text-destructive">{writeError}</p>}
					<Button type="button" variant="ghost" disabled={isPending} onClick={() => setDraft(null)}>
						Discard changes
					</Button>
					<Button type="button" disabled={!write || isPending} onClick={() => setConfirming(true)}>
						{isPending ? 'Saving…' : 'Save & Restart'}
					</Button>
				</div>
			)}

			{(saved.operations.on || saved.application.on) && (
				<Card>
					<CardHeader>
						<CardTitle>Connect an AI tool</CardTitle>
						<CardDescription>
							An AI tool connects straight to an instance, not through Fabric.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<McpConnect hosts={hosts} saved={saved} unsavedChanges={unsavedChanges} />
					</CardContent>
				</Card>
			)}

			<Dialog open={confirming} onOpenChange={setConfirming}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Save and restart?</DialogTitle>
						<DialogDescription>
							Harper turns each part on or off only when it starts, so {instanceParams.entityType === 'cluster'
								? 'Studio saves this to each instance in the cluster and restarts them one at a time.'
								: clusterId && !isLocalStudio
								? "Studio saves this to this instance only and restarts it. The cluster's other instances keep their own settings."
								: 'Studio saves this and restarts the instance.'}
						</DialogDescription>
					</DialogHeader>
					<ul className="list-disc pl-5 text-sm">
						{describeChanges(saved, current).map((change) => <li key={change}>{change}</li>)}
					</ul>
					<DialogFooter>
						<Button type="button" onClick={() => setConfirming(false)}>
							<ArrowLeft /> Cancel
						</Button>
						<Button type="button" variant="destructive" onClick={save}>Save & Restart</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function describeChanges(saved: McpState, draft: McpDraft): string[] {
	const changes: string[] = [];
	if (draft.operationsOn !== saved.operations.on) {
		changes.push(`Turn the operations part ${draft.operationsOn ? 'on' : 'off'}.`);
	}
	if (draft.applicationOn !== saved.application.on) {
		changes.push(`Turn the application part ${draft.applicationOn ? 'on' : 'off'}.`);
	}
	if (!sameMcpCommandAccess(writeMcpCommandList(draft.commands), saved.operations)) {
		changes.push('Change the operations commands.');
	}
	return changes;
}

function PartCard({
	part,
	title,
	description,
	saved,
	on,
	onChange,
	canDisable,
	oldestVersion,
	disabled,
	children,
}: {
	part: McpPart;
	title: string;
	description: string;
	saved: McpState;
	on: boolean;
	onChange: (on: boolean) => void;
	canDisable: boolean;
	oldestVersion: string | undefined;
	disabled?: boolean;
	children: ReactNode;
}) {
	const savedOn = saved[part].on;
	// Below 5.4 nothing Studio can write removes a part's block, and a present block is on.
	const stuckOn = savedOn && !canDisable;
	return (
		<Card>
			<CardHeader>
				<Label className="flex items-center gap-2">
					<Switch
						checked={on}
						onCheckedChange={onChange}
						disabled={disabled || (stuckOn && on)}
						aria-label={`${title} part`}
					/>
					<CardTitle>{title}</CardTitle>
					<span className="text-xs font-normal text-muted-foreground">{on ? 'On' : 'Off'}</span>
				</Label>
				<CardDescription>{description}</CardDescription>
				{stuckOn && (
					<p className="text-xs text-muted-foreground">
						Turning this off needs {DISABLE_NEEDS}. On Harper {oldestVersion}{' '}
						a part stays on while its settings exist, and Studio can't remove them.
					</p>
				)}
				{!savedOn && on && !canDisable && (
					<p className="text-xs text-warning">
						On Harper {oldestVersion}, Studio can't turn this part off again once it's on. Turning it off needs{' '}
						{DISABLE_NEEDS}.
					</p>
				)}
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}
