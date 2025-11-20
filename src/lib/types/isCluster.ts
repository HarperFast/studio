import { Cluster } from '@/integrations/api/api.patch';

export function isCluster(value: unknown): value is Cluster {
	return !!(value as Cluster)?.fqdn;
}
