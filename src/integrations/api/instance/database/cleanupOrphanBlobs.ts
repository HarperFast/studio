import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { ReplicatedResponse } from '@/integrations/api/replication';
import { useMutation } from '@tanstack/react-query';

interface CleanupOrphanBlobsParams extends InstanceClientConfig {
	databaseName: string;
}

async function onCleanupOrphanBlobs(
	{ databaseName, instanceClient }: CleanupOrphanBlobsParams,
): Promise<ReplicatedResponse> {
	const { data } = await instanceClient.post('/', {
		operation: 'cleanup_orphan_blobs',
		database: databaseName,
	});
	return data;
}

export function useCleanupOrphanBlobsMutation() {
	return useMutation({
		mutationFn: onCleanupOrphanBlobs,
	});
}
