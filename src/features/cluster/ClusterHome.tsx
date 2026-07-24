import { SubNavMenu } from '@/components/SubNavMenu';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdownMenu';
import { activeClusterStatuses, deletedClusterStatuses } from '@/config/clusterStatuses';
import { getInstanceClient } from '@/config/getInstanceClient';
import { authStore } from '@/features/auth/store/authStore';
import { allClusterInstancesRunning } from '@/features/cluster/allInstancesRunning';
import { ClusterPageLayout } from '@/features/cluster/components/ClusterPageLayout';
import { ClusterUsageCard } from '@/features/cluster/components/ClusterUsageCard';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { ClusterStateMenu } from '@/features/clusters/components/ClusterStateMenu';
import { useInstanceAuth } from '@/hooks/useAuth';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { useOrganizationClusterPermissions } from '@/hooks/usePermissions';
import { Cluster } from '@/integrations/api/api.patch';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import { onInstanceLogoutSubmit } from '@/integrations/api/instance/auth/onInstanceLogoutSubmit';
import { byInstanceFqdnThenPort } from '@/lib/arrays/sort/byInstanceFqdnThenPort';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useNavigate, useParams, useRouter } from '@tanstack/react-router';
import {
	ArrowRight,
	CircleCheck,
	Copy,
	ExternalLink,
	KeyRound,
	LifeBuoy,
	Loader2,
	Rocket,
	Server,
	Zap,
} from 'lucide-react';
import { ComponentType, ReactNode, useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

export function ClusterHome() {
	const { clusterId } = useParams({ strict: false }) as { clusterId?: string };
	const router = useRouter();
	const navigate = useNavigate();
	const { data: cluster } = useQuery(getClusterInfoQueryOptions(clusterId, true));

	const { user, isLoading } = useInstanceAuth(clusterId);
	const { view, update } = useOrganizationClusterPermissions(cluster?.organizationId, cluster?.id);
	const [isConnecting, setIsConnecting] = useState(false);

	const clusterHost = cluster?.domains?.[0]?.domain || cluster?.fqdn || '';
	const [copyHostName, copyApiUrl] = useCopyToClipboard(clusterHost, clusterHost ? `https://${clusterHost}` : '');

	const base = cluster ? `/${cluster.organizationId}/${cluster.id}` : '';

	const onFabricConnect = useCallback(async () => {
		if (!cluster) { return; }
		setIsConnecting(true);
		try {
			await authStore.establishFabricConnectAuth({
				id: cluster.id,
				operationsUrl: getOperationsUrlForCluster(cluster),
			});
			await router.invalidate();
		} catch {
			toast.error('Could not connect to this cluster through Fabric Connect.');
		} finally {
			setIsConnecting(false);
		}
	}, [cluster, router]);

	const onDirectSignIn = useCallback(() => {
		if (cluster) {
			authStore.setUserForEntity(cluster, null);
			authStore.flagForFabricConnect(cluster.id, false);
		}
		void navigate({ to: `${base}/sign-in` });
	}, [base, cluster, navigate]);

	const onDisconnect = useCallback(async () => {
		if (!cluster) { return; }
		try {
			await onInstanceLogoutSubmit({ instanceClient: getInstanceClient({ id: cluster.id }), entityId: cluster.id });
		} catch {
			// Ignore: we're clearing local state regardless of the server response.
		}
		authStore.setUserForEntity(cluster, null);
		// Clear the persisted connection flags too, and do it even if the logout POST above failed —
		// onInstanceLogoutSubmit clears them on success, but a swallowed error would otherwise leave the
		// Fabric Connect flag and Basic Auth credentials behind in localStorage.
		authStore.flagForFabricConnect(cluster.id, false);
		authStore.flagForBasicAuth(cluster.id, null);
		await router.invalidate();
	}, [cluster, router]);

	if (!cluster) {
		return (
			<ClusterHomeShell>
				<Spinner />
			</ClusterHomeShell>
		);
	}
	if (!view) {
		return <Navigate to={`/${cluster.organizationId}`} replace />;
	}
	if (clusterIsSelfManaged(cluster)) {
		return <SelfHostedClusterHome cluster={cluster} />;
	}
	if (!cluster.fqdn) {
		return <Navigate to={`${base}/instances`} replace />;
	}
	if (cluster.resetPassword) {
		// Only an admin (update) can finish setup / set the password. Match ClusterCardAction: send
		// updaters into the setup flow, but show view-only members a "pending" message instead of
		// redirecting them to a page they can't act on.
		if (!update) {
			return (
				<ClusterHomeShell>
					<div className="text-center py-12">
						<Server className="size-12 text-muted-foreground mx-auto mb-4" />
						<h1 className="text-xl font-medium mb-2 text-foreground">Pending Owner Setup</h1>
						<p className="text-sm text-muted-foreground max-w-md mx-auto">
							This cluster needs an administrator to finish setup before it can be used.
						</p>
					</div>
				</ClusterHomeShell>
			);
		}
		// Hold setup on starting-up until the cluster is active AND every instance is running — on an
		// initial deploy the cluster can report RUNNING while instances are still cloning, and the
		// admin credentials must not be set until they have all settled (FinishSetup enforces this too).
		const readyForSetup = cluster.status && activeClusterStatuses.includes(cluster.status)
			&& allClusterInstancesRunning(cluster);
		return <Navigate to={`${base}/${readyForSetup ? 'finish-setup' : 'starting-up'}`} replace />;
	}

	const isFabricConnect = authStore.checkForFabricConnect(cluster.id);
	const connected = !!user;
	const lastMode = authStore.getLastConnectMode(cluster.id);
	const instanceCount = (cluster.instances ?? [])
		.filter((instance) => instance.status && !deletedClusterStatuses.includes(instance.status))
		.length;

	// The cluster is "fully in safe mode" only when it's up and every instance reports safe mode — a
	// stopped/transitioning instance has no safeMode flag, so a partial cluster won't qualify.
	const clusterInstances = cluster.instances ?? [];
	const allInSafeMode = !!cluster.status
		&& activeClusterStatuses.includes(cluster.status)
		&& clusterInstances.length > 0
		&& clusterInstances.every((instance) => instance.safeMode);

	return (
		<ClusterHomeShell>
			<div className="flex items-start gap-4 mb-6">
				<div className="flex items-center justify-center size-12 rounded-xl bg-violet-50 text-primary dark:bg-grey-700 dark:text-violet-300 shrink-0">
					<Server className="size-6" />
				</div>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-3 flex-wrap">
						<h1 className="text-2xl font-light text-foreground">{cluster.name}</h1>
						<StatusPill status={cluster.status} />
						{allInSafeMode && <SafeModePill />}
					</div>
					<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
						<span>{instanceCount} {instanceCount === 1 ? 'instance' : 'instances'}</span>
						<span aria-hidden="true">·</span>
						<a
							href={`https://${clusterHost}`}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-1 hover:text-foreground hover:underline"
						>
							{clusterHost}
							<ExternalLink className="size-3" />
						</a>
						<DropdownMenu>
							<DropdownMenuTrigger
								aria-label="Copy cluster URLs"
								className="rounded-md p-1 -m-1 hover:bg-accent/60 hover:text-foreground"
							>
								<Copy className="size-3.5" />
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start">
								<DropdownMenuItem onClick={copyHostName}>Copy host name</DropdownMenuItem>
								<DropdownMenuItem onClick={copyApiUrl}>Copy API URL</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>
				<ClusterStateMenu cluster={cluster} />
			</div>

			{isLoading ? <Spinner /> : connected
				? (
					<div>
						<div className="flex items-center gap-2 mb-4 text-sm">
							<CircleCheck className="size-4 text-green shrink-0" />
							<span className="font-medium text-green">
								{isFabricConnect ? 'Connected via Fabric Connect' : 'Signed in directly'}
							</span>
							<span className="text-xs text-muted-foreground">
								· {isFabricConnect ? 'through your Harper account' : 'session cookie'}
							</span>
						</div>

						<Link
							to={`${base}/apps`}
							className="group flex items-center gap-4 rounded-2xl border-2 border-primary/30 bg-primary/5 p-6 transition-all hover:border-primary hover:bg-primary/10 dark:border-violet-400/30 dark:bg-violet-400/5 dark:hover:border-violet-400 dark:hover:bg-violet-400/10"
						>
							<div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0 dark:bg-violet-400/15 dark:text-violet-300">
								<Rocket className="size-6" />
							</div>
							<div className="flex-1 min-w-0">
								<div className="text-lg font-medium text-foreground">Enter cluster</div>
								<div className="text-sm text-muted-foreground">
									Open the studio — apps, databases, APIs, logs, and config.
								</div>
							</div>
							<ArrowRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
						</Link>

						<div className="mt-4 flex flex-wrap gap-4 text-sm">
							{isFabricConnect && (
								<button
									type="button"
									onClick={onDirectSignIn}
									className="text-muted-foreground hover:text-foreground transition-colors"
								>
									Switch to direct sign-in
								</button>
							)}
							<button
								type="button"
								onClick={() => void onDisconnect()}
								className="text-muted-foreground hover:text-destructive transition-colors"
							>
								{isFabricConnect ? 'Disconnect' : 'Direct sign out'}
							</button>
						</div>
					</div>
				)
				: (
					<div>
						<h2 className="text-sm font-medium text-foreground mb-3">Connect to this cluster</h2>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
							{update && !clusterIsSelfManaged(cluster) && (
								<ConnectOption
									icon={Zap}
									title="Fabric Connect"
									description="Connect through your Harper account. No cluster credentials needed."
									pill={lastMode === 'fabric' ? 'last' : lastMode ? undefined : 'recommended'}
								>
									<Button className="w-full" disabled={isConnecting} onClick={() => void onFabricConnect()}>
										{isConnecting ? <Loader2 className="animate-spin" /> : 'Fabric Connect'}
									</Button>
								</ConnectOption>
							)}
							<ConnectOption
								icon={KeyRound}
								title="Direct sign-in"
								description="Sign in with this cluster's Harper username and password."
								pill={lastMode === 'direct' ? 'last' : undefined}
							>
								<Button className="w-full" variant="outline" onClick={onDirectSignIn}>Direct sign-in</Button>
							</ConnectOption>
						</div>
					</div>
				)}

			<ClusterUsageCard base={base} />
		</ClusterHomeShell>
	);
}

// The self-hosted overview: no managed-cluster status, FQDN, or Fabric Connect — connections are made
// directly to the registered instances, so this connects to (and enters through) the first instance.
function SelfHostedClusterHome({ cluster }: { cluster: Cluster }) {
	const router = useRouter();
	const navigate = useNavigate();
	const base = `/${cluster.organizationId}/${cluster.id}`;

	const instances = useMemo(
		() =>
			(cluster.instances ?? [])
				.filter((instance) => instance.status && !deletedClusterStatuses.includes(instance.status))
				.sort(byInstanceFqdnThenPort),
		[cluster.instances],
	);
	const firstInstance = instances.at(0);
	const { user, isLoading } = useInstanceAuth(firstInstance?.id);
	const connected = !!firstInstance && !!user;

	const onDirectSignIn = useCallback(() => {
		if (!firstInstance) { return; }
		void navigate({ to: `${base}/instance/${firstInstance.id}/sign-in` });
	}, [base, firstInstance, navigate]);

	const onDisconnect = useCallback(async () => {
		if (!firstInstance) { return; }
		try {
			await onInstanceLogoutSubmit({
				instanceClient: getInstanceClient({
					id: firstInstance.id,
					operationsUrl: getOperationsUrlForInstance(firstInstance),
				}),
				entityId: firstInstance.id,
			});
		} catch {
			// Ignore: we're clearing local state regardless of the server response.
		}
		authStore.setUserForEntity(firstInstance, null);
		authStore.flagForBasicAuth(firstInstance.id, null);
		await router.invalidate();
	}, [firstInstance, router]);

	return (
		<ClusterHomeShell>
			<div className="flex items-start gap-4 mb-6">
				<div className="flex items-center justify-center size-12 rounded-xl bg-violet-50 text-primary dark:bg-grey-700 dark:text-violet-300 shrink-0">
					<Server className="size-6" />
				</div>
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-3 flex-wrap">
						<h1 className="text-2xl font-light text-foreground">{cluster.name}</h1>
						<span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full text-muted-foreground bg-muted">
							Self-Hosted
						</span>
					</div>
					<div className="mt-1 text-sm text-muted-foreground">
						<Link to={`${base}/instances`} className="hover:text-foreground hover:underline">
							{instances.length} {instances.length === 1 ? 'instance' : 'instances'}
						</Link>
					</div>
				</div>
			</div>

			{!firstInstance
				? (
					<p className="text-sm text-muted-foreground">
						This cluster has no instances yet. Register one from the{' '}
						<Link to={`${base}/instances`} className="underline hover:text-foreground">Instances</Link> page.
					</p>
				)
				: isLoading
				? <Spinner />
				: connected
				? (
					<div>
						<div className="flex items-center gap-2 mb-4 text-sm">
							<CircleCheck className="size-4 text-green shrink-0" />
							<span className="font-medium text-green">Signed in directly</span>
							<span className="text-xs text-muted-foreground">
								· {firstInstance.name || firstInstance.instanceFqdn}
							</span>
						</div>

						<Link
							to={`${base}/instance/${firstInstance.id}/`}
							className="group flex items-center gap-4 rounded-2xl border-2 border-primary/30 bg-primary/5 p-6 transition-all hover:border-primary hover:bg-primary/10 dark:border-violet-400/30 dark:bg-violet-400/5 dark:hover:border-violet-400 dark:hover:bg-violet-400/10"
						>
							<div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0 dark:bg-violet-400/15 dark:text-violet-300">
								<Rocket className="size-6" />
							</div>
							<div className="flex-1 min-w-0">
								<div className="text-lg font-medium text-foreground">Enter cluster</div>
								<div className="text-sm text-muted-foreground">
									Open the studio — apps, databases, APIs, logs, and config.
								</div>
							</div>
							<ArrowRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
						</Link>

						<div className="mt-4 flex flex-wrap gap-4 text-sm">
							<button
								type="button"
								onClick={() => void onDisconnect()}
								className="text-muted-foreground hover:text-destructive transition-colors"
							>
								Direct sign out
							</button>
						</div>
					</div>
				)
				: (
					<div>
						<h2 className="text-sm font-medium text-foreground mb-3">Connect to this cluster</h2>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
							<ConnectOption
								icon={KeyRound}
								title="Direct sign-in"
								description="Sign in with this instance's Harper username and password."
							>
								<Button className="w-full" variant="outline" onClick={onDirectSignIn}>Direct sign-in</Button>
							</ConnectOption>
						</div>
					</div>
				)}
		</ClusterHomeShell>
	);
}

function ClusterHomeShell({ children }: { children: ReactNode }) {
	return (
		<>
			<SubNavMenu />
			<ClusterPageLayout>
				<div className="max-w-3xl">{children}</div>
			</ClusterPageLayout>
		</>
	);
}

function Spinner() {
	return (
		<div className="flex justify-center py-10 text-muted-foreground">
			<Loader2 className="size-6 animate-spin" />
		</div>
	);
}

function StatusPill({ status }: { status?: string }) {
	const active = status && activeClusterStatuses.includes(status);
	const colorClass = active
		? 'text-green bg-green/10'
		: status === 'STOPPED'
		? 'text-destructive bg-destructive/10'
		: status === 'PARTIAL'
		? 'text-yellow bg-yellow/10'
		: 'text-muted-foreground bg-muted';
	return (
		<span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full ${colorClass}`}>
			<span className="size-1.5 rounded-full bg-current" />
			{status ? status.charAt(0) + status.slice(1).toLowerCase() : 'Unknown'}
		</span>
	);
}

// Shown beside the StatusPill when every instance is in safe mode (mirrors the per-instance
// "Safe mode" badge on the Instances page, styled as a rounded-full pill to match StatusPill).
function SafeModePill() {
	return (
		<span
			title="All instances running in safe mode — user apps/components are not loaded"
			className="inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full text-yellow bg-yellow/10"
		>
			<LifeBuoy className="size-3" />
			Safe mode
		</span>
	);
}

function ConnectOption(
	{ icon: Icon, title, description, pill, children }: {
		icon: ComponentType<{ className?: string }>;
		title: string;
		description: string;
		pill?: 'recommended' | 'last';
		children: ReactNode;
	},
) {
	return (
		<div
			className={`relative rounded-xl p-4.5 bg-card border ${
				pill === 'last'
					? 'border-2 border-green'
					: pill === 'recommended'
					? 'border-2 border-primary dark:border-violet-400'
					: 'border-border'
			}`}
		>
			{pill && (
				// Solid backdrop so the card's border doesn't show through the translucent pill color.
				<span className="absolute -top-2.5 left-4 rounded-full bg-card">
					<span
						className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full ${
							pill === 'last'
								? 'text-green bg-green/15'
								: 'text-primary bg-violet-50 dark:text-violet-300 dark:bg-grey-700'
						}`}
					>
						{pill === 'last' && <span className="size-1.5 rounded-full bg-current" />}
						{pill === 'last' ? 'Last used' : 'Recommended'}
					</span>
				</span>
			)}
			<Icon className="size-6 text-primary dark:text-violet-300 mb-2" />
			<div className="text-[15px] font-medium text-foreground mb-1">{title}</div>
			<p className="text-[13px] text-muted-foreground leading-normal mb-4">{description}</p>
			{children}
		</div>
	);
}
