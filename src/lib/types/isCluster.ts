import { Cluster } from '@/lib/api.patch';

export function isCluster(value: unknown): value is Cluster {
	return !!(value as Cluster)?.fqdn;
}
