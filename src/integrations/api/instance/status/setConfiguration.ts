import { deletedClusterStatuses } from '@/config/clusterStatuses';
import { InstanceClientConfig } from '@/config/instanceClientConfig';
import { Instance } from '@/integrations/api/api.patch';
import { ReplicatedResponse } from '@/integrations/api/replication';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';

/**
 * The first Harper release whose `set_configuration` takes `replicated: true` and fans the write out
 * to every replication peer (HarperFast/harper#1556). 5.0 and 5.1 apply the change locally and report
 * no peers. Prereleases of 5.2.0 read as unsupported.
 */
const REPLICATED_SET_CONFIGURATION_MIN_VERSION = '5.2.0';

/**
 * Whether a cluster-wide config save should fan its write out: some other live member exists to
 * reach — including ones Studio will not restart — and every live member runs a Harper that can.
 */
export function shouldFanOutSetConfiguration(
	instances: ReadonlyArray<Pick<Instance, 'status' | 'version'>>,
): boolean {
	const live = instances.filter(instance => !(instance.status && deletedClusterStatuses.includes(instance.status)));
	return live.length > 1
		&& live.every(instance =>
			!!instance.version && wasAReleasedBeforeB(REPLICATED_SET_CONFIGURATION_MIN_VERSION, instance.version)
		);
}

interface SetConfigurationParams extends InstanceClientConfig {
	[key: string]: unknown;
}

export async function setConfiguration({
	instanceClient,
	...changes
}: SetConfigurationParams): Promise<ReplicatedResponse> {
	const { data } = await instanceClient.post('/', {
		operation: 'set_configuration',
		...changes,
	});
	return data;
}
