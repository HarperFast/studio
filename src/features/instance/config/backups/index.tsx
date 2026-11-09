import { Loading } from '@/components/Loading';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { isLocalStudio } from '@/config/constants';
import { getInstanceClientIdFromParams, useInstanceClientIdParams } from '@/config/useInstanceClient';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import {
	anyMemberSupportsBackups,
	backupNodeLabel,
	ClusterBackupNode,
	clusterBackupNodes,
} from '@/features/instance/config/backups/backupNodes';
import {
	BackupNodeCard,
	BackupNodeNotice,
	BackupNodeSection,
} from '@/features/instance/config/backups/BackupNodeSection';
import { useInstanceAuth } from '@/hooks/useAuth';
import { useInstanceManagePermission, useOrganizationClusterInstancePermissions } from '@/hooks/usePermissions';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import { BACKUPS_MIN_VERSION, supportsBackups } from '@/integrations/api/instance/backups/backups';
import { getDescribeAllQueryOptions } from '@/integrations/api/instance/database/getDescribeAll';
import { getRegistrationInfoQueryOptions } from '@/integrations/api/instance/status/getRegistrationInfo';
import { describeError } from '@/react-query/queryClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { RefreshCwIcon, TriangleAlertIcon } from 'lucide-react';
import { ReactNode, useId, useMemo, useState } from 'react';

export function ConfigBackupsIndex() {
	const { entityId } = useInstanceClientIdParams();
	// The router keeps this page mounted across a switch to another cluster or instance, and a dialog or a
	// followed job meant for one must never act on, or report about, the next.
	return <BackupsPage key={entityId} />;
}

function PageNotice({ children }: { children: ReactNode }) {
	return <p className="rounded-md border p-4 text-sm text-muted-foreground">{children}</p>;
}

function BackupsPage() {
	const instanceParams = useInstanceClientIdParams();
	const { clusterId, instanceId }: { clusterId?: string; instanceId?: string } = useParams({ strict: false });
	const canManage = useInstanceManagePermission();
	const { user } = useInstanceAuth(instanceParams.entityId);
	const { update: canUpdateCluster } = useOrganizationClusterInstancePermissions();
	const queryClient = useQueryClient();

	const { data: registrationInfo, isError: isVersionError } = useQuery(
		getRegistrationInfoQueryOptions(instanceParams),
	);
	const {
		data: cluster,
		isError: isClusterError,
		refetch: refetchCluster,
	} = useQuery(getClusterInfoQueryOptions(!isLocalStudio && clusterId));
	// From a cluster's own page every member is listed and reached on its own; from an instance's page, or from
	// the Studio a Harper serves, the page's own connection already reaches exactly one node.
	const perNode = !isLocalStudio && instanceId === undefined;
	const isSelfManaged = cluster !== undefined && clusterIsSelfManaged(cluster);

	const ownVersionSupported = registrationInfo === undefined ? undefined : supportsBackups(registrationInfo.version);
	// A cluster's address answers for whichever member runs first, so mid-upgrade an old one could hide the page from
	// every upgraded one. Any member on 5.2 is enough: each is gated on its own version below.
	let supported = ownVersionSupported;
	if (perNode && ownVersionSupported !== true) {
		supported = cluster
			? anyMemberSupportsBackups(cluster.instances)
			: isClusterError
			? ownVersionSupported
			: undefined;
	}
	const ready = canManage && supported === true;

	const {
		data: describeAll,
		error: databasesError,
		refetch: refetchDatabases,
	} = useQuery({
		...getDescribeAllQueryOptions({ ...instanceParams, skipRecordCount: true }),
		enabled: ready,
	});
	const databases = useMemo(() => Object.keys(describeAll ?? {}).sort(), [describeAll]);
	const [chosenDatabase, setChosenDatabase] = useState<string>();
	const database = chosenDatabase !== undefined && databases.includes(chosenDatabase) ? chosenDatabase : databases[0];
	const databaseSelectId = useId();

	const onRefreshClick = useRefreshClick(async () => {
		await Promise.all([
			refetchDatabases(),
			clusterId && !isLocalStudio ? refetchCluster() : undefined,
			queryClient.invalidateQueries({ predicate: (query) => query.queryKey[1] === 'list_backups' }),
		]);
	});

	if (!canManage) {
		// No user yet means auth is still resolving, and a super user would otherwise see the denial flash.
		return user
			? <PageNotice>Only super users can view or manage backups.</PageNotice>
			: <Loading text="Loading..." />;
	}
	if (supported === undefined) {
		return isVersionError && (!perNode || isClusterError)
			? <PageNotice>This Harper's version could not be read, so its backups are not shown.</PageNotice>
			: <Loading text="Loading..." />;
	}
	if (!supported) {
		return (
			<PageNotice>
				Backups need Harper {BACKUPS_MIN_VERSION} or later. {perNode && cluster
					? "None of this cluster's nodes runs it yet."
					: `This ${perNode ? 'cluster' : 'instance'} runs ${registrationInfo?.version}.`}
			</PageNotice>
		);
	}

	const fabricManaged = !isLocalStudio && !isSelfManaged;

	let nodes: ReactNode;
	if (databasesError) {
		nodes = <PageNotice>The databases could not be listed: {describeError(databasesError).message}</PageNotice>;
	} else if (!describeAll) {
		nodes = <Loading text="Loading..." />;
	} else if (!database) {
		nodes = <PageNotice>There are no databases to back up yet.</PageNotice>;
	} else if (!perNode) {
		const self = cluster?.instances?.find((candidate) => candidate.id === instanceId);
		const label = self && !isLocalStudio ? backupNodeLabel(self) : undefined;
		nodes = (
			<BackupNodeCard label={label ?? 'This instance'} detail={self?.instanceFqdn}>
				<BackupNodeSection
					nodeParams={instanceParams}
					label={label ?? 'This instance'}
					name={label ?? 'this instance'}
					database={database}
				/>
			</BackupNodeCard>
		);
	} else if (isClusterError) {
		nodes = <PageNotice>This cluster's nodes could not be listed, so their backups are not shown.</PageNotice>;
	} else if (!cluster) {
		nodes = <Loading text="Loading..." />;
	} else if (isSelfManaged) {
		nodes = (
			<PageNotice>
				Studio can reach one node of a self-hosted cluster only from that node's own page. Open an instance from this
				cluster's Instances list, then Config, then Backups.
			</PageNotice>
		);
	} else if (!canUpdateCluster) {
		nodes = (
			<PageNotice>
				Studio reaches each node through Fabric, which needs permission to update this cluster. Ask an organization
				admin for it.
			</PageNotice>
		);
	} else {
		const members = clusterBackupNodes(cluster.instances);
		nodes = members.length === 0
			? <PageNotice>This cluster has no nodes yet.</PageNotice>
			: members.map((node) => <ClusterNodeBackups key={node.instance.id} node={node} database={database} />);
	}

	return (
		<div className="flex flex-col gap-6 px-4 md:px-0">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="max-w-2xl space-y-1">
					<h2 className="text-lg font-semibold">Backups</h2>
					<p className="text-sm text-muted-foreground">
						Take, check and delete backups of a database. Each node keeps its own backups of its own copy of the
						database, and copies only the files that changed since its last backup.
					</p>
				</div>
				<Button variant="defaultOutline" onClick={onRefreshClick}>
					<RefreshCwIcon />
					<span className="hidden lg:inline-block">Refresh</span>
				</Button>
			</div>

			<div className="flex items-start gap-2 rounded-md border border-amber-500/50 p-3 text-sm text-muted-foreground">
				<TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-500" />
				<ul className="flex flex-col gap-1">
					<li>Backups are stored on the node's own disk, and use its storage.</li>
					<li>
						{fabricManaged
							? "They don't protect against losing that node. Fabric deletes a node's backups when it moves the node or removes it from the cluster."
							: "They don't protect against losing that node's disk."}
					</li>
					<li>Restoring a backup isn't available in Studio yet.</li>
				</ul>
			</div>

			{databases.length > 0 && (
				<div className="flex flex-wrap items-center gap-2">
					<Label htmlFor={databaseSelectId}>Database</Label>
					<select
						id={databaseSelectId}
						className="h-10 max-w-full rounded-md border border-input bg-card px-3 text-sm"
						value={database}
						onChange={(event) => setChosenDatabase(event.target.value)}
					>
						{databases.map((name) => <option key={name} value={name}>{name}</option>)}
					</select>
				</div>
			)}

			{nodes}
		</div>
	);
}

/** One cluster member, reached through Fabric by its instance id so every request lands on that node. */
function ClusterNodeBackups({ node, database }: { node: ClusterBackupNode; database: string }) {
	const { instance, label, operationsUrl, unavailable } = node;
	const nodeParams = useMemo(
		() => getInstanceClientIdFromParams({ instanceId: instance.id, operationsUrl, forceFabricConnect: true }),
		[instance.id, operationsUrl],
	);
	return (
		<BackupNodeCard label={label} detail={instance.instanceFqdn}>
			{unavailable
				? <BackupNodeNotice>{unavailable}</BackupNodeNotice>
				: <BackupNodeSection nodeParams={nodeParams} label={label} database={database} />}
		</BackupNodeCard>
	);
}
