import { Cluster } from '@/integrations/api/api.patch';

export function clusterIsSelfManaged(cluster: Cluster | undefined): boolean {
	return !!cluster?.plans?.[0]?.planId?.startsWith('self-hosted');
}
