import { Cluster } from '@/integrations/api/api.patch';
import { linkify } from '@/lib/urls/linkify';

export function getRestUrlForCluster(cluster: undefined | Pick<Cluster, 'fqdn' | 'domains'>): string | null {
	if (cluster?.domains) {
		for (const domain of cluster.domains) {
			if (domain.domain) {
				return linkify(domain.domain);
			}
		}
	}
	if (!cluster?.fqdn) {
		return null;
	}
	return linkify(cluster.fqdn);
}
