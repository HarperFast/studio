import { apiClient } from '@/config/apiClient';
import { authStore } from '@/features/auth/store/authStore';
import { getClusterInfo } from '@/features/cluster/queries/getClusterInfoQuery';
import { clusterSignInIds } from '@/features/cluster/terminatedClusterSignIns';
import { Cluster } from '@/integrations/api/api.patch';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import { useMutation, useQueryClient } from '@tanstack/react-query';

/** What `DELETE /Cluster/:id` answers, under either contract (`terminationStarted`). */
export interface TerminateClusterResult {
	id?: string;
	deleted?: boolean;
	workflowId?: string;
	status?: string;
}

export async function terminateCluster(clusterId: string): Promise<TerminateClusterResult> {
	const before = readCluster(clusterId);
	const { data } = await apiClient.delete(`/Cluster/${clusterId}` as '/Cluster/{id}', { timeout: 0 });
	const result = data as unknown as TerminateClusterResult;
	void forgetSignIns(clusterId, before, terminationStarted(result));
	return result;
}

/**
 * Whether the teardown is still to come. Only the older contract's `{ deleted: true }` says it ran inside the request;
 * central-manager#1134 answers `{ status: 'TERMINATING' }` at admission, and a repeated delete of a cluster already
 * gone answers 204 with no body, so anything else is never read as done.
 */
export function terminationStarted(result: TerminateClusterResult | undefined): boolean {
	return result?.deleted !== true;
}

/** The success toast's text for either answer; a self-hosted cluster is removed from Fabric, not torn down. */
export function describeTermination(result: TerminateClusterResult | undefined, selfManaged: boolean): string {
	if (!terminationStarted(result)) {
		return selfManaged ? 'Cluster successfully removed.' : 'Cluster successfully terminated.';
	}
	if (result?.status === 'TERMINATING') {
		return selfManaged
			? 'Cluster removal started. It stays listed until Harper Fabric has let go of every instance.'
			: 'Cluster termination started. It stays listed as Terminating until every instance is gone.';
	}
	return selfManaged ? 'Cluster removal requested.' : 'Cluster termination requested.';
}

/**
 * The organization's cluster list carries no instances, so they come from the cluster record: read alongside the DELETE,
 * or read back after it, since central manager keeps a terminated cluster's record and its instances. Without either
 * read nothing is forgotten, since the cluster might be self-hosted: a Fabric cluster's go on its next visit
 * (`ClusterLayout`), a self-hosted one's at the next app sign-out. A delete that was only admitted leaves the hosts
 * serving until each confirms its teardown, and a paused one keeps them, so those get a logout like a self-hosted
 * removal's; a torn-down cluster's are forgotten without one.
 */
async function forgetSignIns(clusterId: string, before: Promise<Cluster | undefined>, hostsMayServe: boolean) {
	const cluster = await before ?? await readCluster(clusterId);
	if (!cluster) {
		return;
	}
	if (hostsMayServe || clusterIsSelfManaged(cluster)) {
		await authStore.signOutEntities(clusterSignInIds(cluster));
	} else {
		authStore.signOutEntitiesLocally(clusterSignInIds(cluster));
	}
}

function readCluster(clusterId: string): Promise<Cluster | undefined> {
	return getClusterInfo(clusterId).catch((error: unknown) => {
		console.debug(
			`Could not read cluster ${clusterId} to forget its sign-ins`,
			error instanceof Error ? error.message : error,
		);
		return undefined;
	});
}

export function useTerminateClusterMutation() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (clusterId: string) => terminateCluster(clusterId),
		onSuccess: (_result, clusterId) => queryClient.invalidateQueries({ queryKey: [clusterId], exact: true }),
	});
}
