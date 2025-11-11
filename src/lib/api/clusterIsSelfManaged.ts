import { Cluster } from '@/lib/api.patch';

export function clusterIsSelfManaged(cluster: Cluster | undefined): boolean {
	return !!cluster?.plans?.[0]?.planId?.startsWith('self-hosted');
}
