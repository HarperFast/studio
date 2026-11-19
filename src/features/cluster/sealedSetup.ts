import { deletedClusterStatuses } from '@/config/clusterStatuses';
import { Cluster, Instance } from '@/integrations/api/api.patch';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';

// `encrypted_operation` shipped in Harper 5.4.0 (HarperFast/harper#4205).
const SEALED_SETUP_MIN_VERSION = '5.4.0';

export interface SealedSetupCapability {
	keyFingerprint: string;
}

/**
 * Whether setup can seal its writes to the cluster's key, read from the cluster record alone: a Fabric-hosted cluster
 * whose every live member reports 5.4.0 or later and carries the same secrets key fingerprint. The fingerprint is what
 * says the key exists and reached each host, so the key fetch that follows is a plain read; asking central manager
 * for a key it does not hold yet would create one and restart the members. A member with no version, a prerelease of
 * 5.4.0, or no fingerprint fails closed.
 */
export function sealedSetupCapability(cluster: Cluster | undefined): SealedSetupCapability | null {
	const live = liveMembersAbleToSeal(cluster);
	if (!live) {
		return null;
	}
	const keyFingerprint = live[0].secretsKeyFingerprint;
	return keyFingerprint && live.every((instance) => instance.secretsKeyFingerprint === keyFingerprint)
		? { keyFingerprint }
		: null;
}

/**
 * The members could seal, or have not said yet, but the record does not carry what sealing needs: a version for every
 * member and one key stamped on all of them. Central manager fills both in; a submit before that is not a permission
 * problem.
 */
export function clusterKeyPending(cluster: Cluster | undefined): boolean {
	const live = liveMembers(cluster);
	return !!live
		&& live.every((instance) => !instance.version || wasAReleasedBeforeB(SEALED_SETUP_MIN_VERSION, instance.version))
		&& sealedSetupCapability(cluster) === null;
}

function liveMembers(cluster: Cluster | undefined): Instance[] | null {
	if (!cluster || clusterIsSelfManaged(cluster)) {
		return null;
	}
	const live = (cluster.instances ?? []).filter(
		(instance) => !(instance.status && deletedClusterStatuses.includes(instance.status)),
	);
	return live.length > 0 ? live : null;
}

function liveMembersAbleToSeal(cluster: Cluster | undefined): Instance[] | null {
	const live = liveMembers(cluster);
	return live?.every((instance) =>
			!!instance.version && wasAReleasedBeforeB(SEALED_SETUP_MIN_VERSION, instance.version)
		)
		? live
		: null;
}
