export const activeClusterStatuses = ['RUNNING'];
export const deletedClusterStatuses = ['TERMINATING', 'TERMINATED', 'REMOVED'];

/**
 * Whether a cluster is gone, or going, so there is nothing left to sign in to. `FAILED` alone is not
 * enough: central manager stamps `terminatedAt` only on a failed build it rolled back and tore down,
 * never on a live cluster whose update crashed with its instances still serving (its `isClusterTornDown`).
 */
export function isDeletedCluster(cluster: { status?: string; terminatedAt?: string } | undefined): boolean {
	if (!cluster?.status) {
		return false;
	}
	return deletedClusterStatuses.includes(cluster.status) || (cluster.status === 'FAILED' && !!cluster.terminatedAt);
}
