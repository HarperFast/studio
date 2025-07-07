import { SchemaCluster } from '@/lib/api.gen';

export function isCluster(value: unknown): value is SchemaCluster {
	return !!(value as SchemaCluster)?.fqdn;
}
