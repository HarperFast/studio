import { isOperationsProxyRefused, isStoppedOrTransitioning } from '@/components/ui/utils/badgeStatus';
import { Instance } from '@/integrations/api/api.patch';
import { BACKUPS_MIN_VERSION, supportsBackups } from '@/integrations/api/instance/backups/backups';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';

/** A cluster member the Backups page lists, and whether Studio can reach its backups right now. */
export interface ClusterBackupNode {
	instance: Instance;
	label: string;
	operationsUrl: string | null;
	/** Why the node's backups can't be read now. Absent when they can. */
	unavailable?: string;
}

/** A removed node's disk is gone, and its backups with it, so it has nothing to list. */
const GONE_STATUSES = new Set(['TERMINATING', 'TERMINATED', 'REMOVED']);

export function backupNodeLabel(instance: Pick<Instance, 'id' | 'name' | 'instanceFqdn'>): string {
	return instance.name || instance.instanceFqdn || instance.id;
}

function unavailableReason(instance: Instance, operationsUrl: string | null): string | undefined {
	if (!operationsUrl) {
		return "This node doesn't have an address yet.";
	}
	if (isOperationsProxyRefused(instance.status)) {
		return isStoppedOrTransitioning(instance.status)
			? "This node isn't running. Its backups show here once it is."
			: "Fabric reports this node as failed, so Studio can't reach it.";
	}
	// An unreported version is left to Harper: an older node refuses the operation by name.
	if (instance.version && !supportsBackups(instance.version)) {
		return `This node runs Harper ${instance.version}. Backups need Harper ${BACKUPS_MIN_VERSION} or later.`;
	}
	return undefined;
}

export function anyMemberSupportsBackups(instances: readonly Instance[] | undefined): boolean {
	return (instances ?? []).some((instance) =>
		!GONE_STATUSES.has(instance.status ?? '') && supportsBackups(instance.version)
	);
}

/**
 * Every member of a cluster that still has a disk, in name order. Each is reached on its own: backups live on
 * the disk of the node that took them, and the cluster's own address reaches whichever member runs first.
 */
export function clusterBackupNodes(instances: readonly Instance[] | undefined): ClusterBackupNode[] {
	return (instances ?? [])
		.filter((instance) => !GONE_STATUSES.has(instance.status ?? ''))
		.map((instance) => {
			const operationsUrl = getOperationsUrlForInstance(instance);
			return {
				instance,
				label: backupNodeLabel(instance),
				operationsUrl,
				unavailable: unavailableReason(instance, operationsUrl),
			};
		})
		.sort((a, b) => a.label.localeCompare(b.label) || a.instance.id.localeCompare(b.instance.id));
}
