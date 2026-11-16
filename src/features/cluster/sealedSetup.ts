import { deletedClusterStatuses } from '@/config/clusterStatuses';
import { Cluster } from '@/integrations/api/api.patch';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';

/** `encrypted_operation` shipped in Harper 5.4.0 (HarperFast/harper#4205). */
export const SEALED_SETUP_MIN_VERSION = '5.4.0';

export interface SealedSetupCapability {
	/** The cluster secrets key every live member holds, by its fingerprint. */
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
	if (!cluster || clusterIsSelfManaged(cluster)) {
		return null;
	}
	const live = (cluster.instances ?? []).filter(
		(instance) => !(instance.status && deletedClusterStatuses.includes(instance.status)),
	);
	const keyFingerprint = live[0]?.secretsKeyFingerprint;
	if (
		!keyFingerprint
		|| !live.every((instance) =>
			instance.secretsKeyFingerprint === keyFingerprint
			&& !!instance.version
			&& wasAReleasedBeforeB(SEALED_SETUP_MIN_VERSION, instance.version)
		)
	) {
		return null;
	}
	return { keyFingerprint };
}
