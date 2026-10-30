import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { getClusterInfoQueryOptions } from '@/features/cluster/queries/getClusterInfoQuery';
import { clusterIsSelfManaged } from '@/integrations/api/clusterIsSelfManaged';
import { SecretsPublicKeySource } from '@/integrations/api/instance/secrets/secrets';
import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { useMemo } from 'react';

/**
 * Where this entity's secrets key comes from. Fabric-managed clusters get it from central-manager (the custodian — it
 * mints the keypair on first use, central-manager#409); self-hosted/local nodes serve their own.
 *
 * The source depends on the cluster tier, so it isn't known until the cluster lookup SUCCEEDS. `cluster === undefined`
 * covers both the load window and a failed fetch (getClusterInfoQuery has retry:false, so `data` stays undefined on
 * error) — treating either as self-managed would route a managed cluster to the node key: a transient banner flash
 * while loading, and a non-self-healing mis-route on error (set_secret would then encrypt against the wrong key and fail
 * a kid mismatch the retry can't heal). So hold the key fetch on `known`, which only skips the wait when there's no
 * clusterId (local Studio — the node is always right).
 */
export function useSecretsKeySource(
	instanceParams: InstanceClientIdConfig,
): { keySource: SecretsPublicKeySource; known: boolean; clusterInfoUnavailable: boolean } {
	const { clusterId }: { clusterId?: string } = useParams({ strict: false });
	const clusterQuery = useQuery(getClusterInfoQueryOptions(clusterId, false));
	const cluster = clusterQuery.data;
	const isSelfManaged = cluster === undefined || clusterIsSelfManaged(cluster);
	const managedClusterId = !isSelfManaged ? clusterId : undefined;
	const keySource = useMemo(() => ({ ...instanceParams, managedClusterId }), [instanceParams, managedClusterId]);
	return {
		keySource,
		known: !clusterId || clusterQuery.isSuccess,
		clusterInfoUnavailable: !!clusterId && clusterQuery.isError,
	};
}
