import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { agentOverviewQueryOptions } from '@/features/admin/agent/agentAdminApi';
import { ActiveRuns, PastRuns, useActiveRunChanges } from '@/features/admin/agent/components/Activity';
import { LoadFailed } from '@/features/admin/agent/components/AgentBits';
import { AgentSettingsForm, useAgentSettingsEditor } from '@/features/admin/agent/components/AgentSettingsForm';
import { SpendPanel, WatchesPanel } from '@/features/admin/agent/components/SpendAndWatches';
import { RefreshFailed } from '@/features/admin/workflows/components/WorkflowBits';
import { useCloudAuth, useStaffPermission } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';

export function switchedOffReason(
	overview: { agentEnabled: boolean; roles: Array<{ role: string; enabled: boolean }> },
) {
	if (!overview.agentEnabled) { return 'The agent is switched off, so no run starts. Turn it on under Settings.'; }
	const off = overview.roles.filter((role) => !role.enabled).map((role) => role.role);
	if (off.length && off.length === overview.roles.length) {
		return `The ${off.join(', ')} role is switched off, so no run starts. Turn it on under Settings.`;
	}
	return null;
}

/** Staff page for the investigation agent. AdminShell gates it on agent:read; Cancel and Settings gate themselves. */
export function AgentAdminIndex() {
	const canCancel = useStaffPermission('agent:run');
	const canWriteConfig = useStaffPermission('config:write');
	const { user } = useCloudAuth();
	const isCoreSuperUser = user !== null && 'fabricRole' in user && user.fabricRole === 'super_user';
	const overview = useQuery(agentOverviewQueryOptions());
	const offReason = overview.data ? switchedOffReason(overview.data) : null;
	const settingsEditor = useAgentSettingsEditor();
	useActiveRunChanges();

	return (
		<div className="min-w-0">
			<h1 className="text-2xl font-semibold tracking-tight">Agent</h1>
			<p className="mt-2 text-sm text-muted-foreground max-w-3xl">
				The investigation agent starts on its own when a cluster operation fails, reads a fixed set of evidence and
				writes a finding. It never changes a cluster.
			</p>

			{offReason && (
				<Alert className="mt-4">
					<AlertTitle>Switched off</AlertTitle>
					<AlertDescription>{offReason}</AlertDescription>
				</Alert>
			)}

			{overview.isLoading
				? <p className="mt-6 text-sm text-muted-foreground">Loading spend…</p>
				: overview.data
				? (
					<>
						{overview.error && (
							<div className="mt-6">
								<RefreshFailed error={overview.error} />
							</div>
						)}
						<SpendPanel overview={overview.data} />
					</>
				)
				: (
					<div className="mt-6">
						<LoadFailed what="spend" error={overview.error} />
					</div>
				)}

			<Tabs defaultValue="activity" className="mt-6">
				<TabsList className="mb-2">
					<TabsTrigger value="activity">Activity</TabsTrigger>
					<TabsTrigger value="watches">Watches</TabsTrigger>
					<TabsTrigger value="settings">Settings</TabsTrigger>
				</TabsList>
				<TabsContent value="activity" className="mt-4">
					<ActiveRuns canCancel={canCancel} />
					<PastRuns />
				</TabsContent>
				<TabsContent value="watches" className="mt-4">
					<WatchesPanel />
				</TabsContent>
				<TabsContent value="settings" className="mt-4">
					{overview.isLoading
						? <p className="text-sm text-muted-foreground">Loading settings…</p>
						: overview.data
						? (
							<AgentSettingsForm
								settings={overview.data.settings}
								canWrite={canWriteConfig}
								isCoreSuperUser={isCoreSuperUser}
								editor={settingsEditor}
							/>
						)
						: <LoadFailed what="settings" error={overview.error} />}
				</TabsContent>
			</Tabs>
		</div>
	);
}
