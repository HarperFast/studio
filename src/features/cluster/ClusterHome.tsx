import { SubNavMenu } from '@/components/SubNavMenu';
import { Button } from '@/components/ui/button';
import { activeClusterStatuses } from '@/config/clusterStatuses';
import { getInstanceClient } from '@/config/getInstanceClient';
import { authStore } from '@/features/auth/store/authStore';
import { ClusterPageLayout } from '@/features/cluster/components/ClusterPageLayout';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { useInstanceAuth } from '@/hooks/useAuth';
import { useOrganizationClusterPermissions } from '@/hooks/usePermissions';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import { onInstanceLogoutSubmit } from '@/integrations/api/instance/auth/onInstanceLogoutSubmit';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useNavigate, useParams, useRouter } from '@tanstack/react-router';
import { ArrowRight, CircleCheck, KeyRound, Loader2, Rocket, Server, Zap } from 'lucide-react';
import { ComponentType, ReactNode, useCallback, useState } from 'react';
import { toast } from 'sonner';

export function ClusterHome() {
	const { clusterId } = useParams({ strict: false }) as { clusterId?: string };
	const router = useRouter();
	const navigate = useNavigate();
	const { data: cluster } = useQuery(getClusterInfoQueryOptions(clusterId, true));

	const { user, isLoading } = useInstanceAuth(clusterId);
	const { view, update } = useOrganizationClusterPermissions(cluster?.organizationId, cluster?.id);
	const [isConnecting, setIsConnecting] = useState(false);

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
	if (!cluster.fqdn) {
		return <Navigate to={`${base}/instances`} replace />;
	}
	if (cluster.resetPassword) {
		const isActive = cluster.status && activeClusterStatuses.includes(cluster.status);
		return <Navigate to={`${base}/${isActive ? 'finish-setup' : 'starting-up'}`} replace />;
	}

	const isFabricConnect = authStore.checkForFabricConnect(cluster.id);
	const connected = !!user;
	const lastMode = authStore.getLastConnectMode(cluster.id);

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
					</div>
					<div className="mt-1 text-sm text-muted-foreground">
						{cluster.instances?.length ?? 0} instances · {cluster.fqdn}
					</div>
				</div>
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
	return (
		<span
			className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full ${
				active ? 'text-green bg-green/10' : 'text-muted-foreground bg-muted'
			}`}
		>
			<span className="size-1.5 rounded-full bg-current" />
			{status ? status.charAt(0) + status.slice(1).toLowerCase() : 'Unknown'}
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
				<span
					className={`absolute -top-2.5 left-4 inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full ${
						pill === 'last'
							? 'text-green bg-green/15'
							: 'text-primary bg-violet-50 dark:text-violet-300 dark:bg-grey-700'
					}`}
				>
					{pill === 'last' && <span className="size-1.5 rounded-full bg-current" />}
					{pill === 'last' ? 'Last used' : 'Recommended'}
				</span>
			)}
			<Icon className="size-6 text-primary dark:text-violet-300 mb-2" />
			<div className="text-[15px] font-medium text-foreground mb-1">{title}</div>
			<p className="text-[13px] text-muted-foreground leading-normal mb-4">{description}</p>
			{children}
		</div>
	);
}
