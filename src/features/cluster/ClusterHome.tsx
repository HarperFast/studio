import { Breadcrumbs } from '@/components/Breadcrumbs';
import { Button } from '@/components/ui/button';
import { activeClusterStatuses } from '@/config/clusterStatuses';
import { defaultInstanceRoute } from '@/config/constants';
import { getInstanceClient } from '@/config/getInstanceClient';
import { authStore } from '@/features/auth/store/authStore';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { useInstanceAuth } from '@/hooks/useAuth';
import { useOrganizationClusterPermissions } from '@/hooks/usePermissions';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import { onInstanceLogoutSubmit } from '@/integrations/api/instance/auth/onInstanceLogoutSubmit';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';
import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useNavigate, useParams, useRouter } from '@tanstack/react-router';
import { ArrowRight, CircleCheck, Database, Gauge, Globe, KeyRound, Loader2, Server, Zap } from 'lucide-react';
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
				<div className="flex items-center justify-center size-12 rounded-xl bg-violet-50 text-primary dark:bg-grey-700 shrink-0">
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
						<div className="flex items-center gap-3 p-4 rounded-xl bg-green/10 mb-3">
							<CircleCheck className="size-5 text-green" />
							<div className="flex-1">
								<div className="text-sm font-medium text-green">
									{isFabricConnect ? 'Connected via Fabric Connect' : 'Signed in directly'}
								</div>
								<div className="text-xs text-muted-foreground">
									{isFabricConnect ? 'Through your Harper account' : 'Session cookie'}
								</div>
							</div>
						</div>
						<div className="flex gap-2 flex-wrap">
							<Link to={`${base}${defaultInstanceRoute}`}>
								<Button>
									Enter cluster <ArrowRight />
								</Button>
							</Link>
							{isFabricConnect && <Button variant="outline" onClick={onDirectSignIn}>Switch to direct sign-in</Button>}
							<Button variant="destructiveOutline" onClick={() => void onDisconnect()}>
								{isFabricConnect ? 'Disconnect' : 'Direct sign out'}
							</Button>
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

			<div className="mt-7 pt-5 border-t border-border">
				<div className="text-xs text-muted-foreground mb-3">Manage</div>
				<div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
					<ManageTile
						to={`${base}/instances`}
						icon={Server}
						label="Instances"
						hint={`${cluster.instances?.length ?? 0} running`}
						enabled={connected}
					/>
					<ManageTile
						to={`${base}${defaultInstanceRoute}`}
						icon={Database}
						label="Databases"
						hint="Browse and query"
						enabled={connected}
					/>
					<ManageTile
						to={`${base}/scaling`}
						icon={Gauge}
						label="Scaling"
						hint="Size and replicas"
						enabled={connected && update}
					/>
					<ManageTile
						to={`${base}/domains`}
						icon={Globe}
						label="Domains"
						hint="Custom domains"
						enabled={connected && update}
					/>
				</div>
				<div className="mt-3.5 text-xs text-muted-foreground">Scaling and domains require manage permission.</div>
			</div>
		</ClusterHomeShell>
	);
}

function ClusterHomeShell({ children }: { children: ReactNode }) {
	return (
		<>
			<nav className="fixed top-20 w-full h-12 z-39 px-4 md:px-12 bg-violet-50 border-b border-violet-100 dark:bg-grey-700 dark:border-none flex items-center">
				<Breadcrumbs />
			</nav>
			<div className="mt-32 max-w-3xl mx-auto px-4 md:px-6 pb-10">{children}</div>
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
					? 'border-2 border-primary'
					: 'border-border'
			}`}
		>
			{pill && (
				<span
					className={`absolute -top-2.5 left-4 inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full ${
						pill === 'last' ? 'text-green bg-green/15' : 'text-primary bg-violet-50 dark:bg-grey-700'
					}`}
				>
					{pill === 'last' && <span className="size-1.5 rounded-full bg-current" />}
					{pill === 'last' ? 'Last used' : 'Recommended'}
				</span>
			)}
			<Icon className="size-6 text-primary mb-2" />
			<div className="text-[15px] font-medium text-foreground mb-1">{title}</div>
			<p className="text-[13px] text-muted-foreground leading-normal mb-4">{description}</p>
			{children}
		</div>
	);
}

function ManageTile(
	{ to, icon: Icon, label, hint, enabled }: {
		to: string;
		icon: ComponentType<{ className?: string }>;
		label: string;
		hint: string;
		enabled: boolean;
	},
) {
	const body = (
		<>
			<Icon className="size-5 text-primary shrink-0" />
			<div className="min-w-0">
				<div className="text-[13px] font-medium text-foreground truncate">{label}</div>
				<div className="text-[11px] text-muted-foreground truncate">{hint}</div>
			</div>
		</>
	);
	const className = 'flex items-center gap-3 p-3 rounded-xl border border-border bg-card';
	if (!enabled) {
		return <div className={`${className} opacity-50`} aria-disabled>{body}</div>;
	}
	return <Link to={to} className={`${className} hover:border-primary/40 hover:bg-accent/60`}>{body}</Link>;
}
