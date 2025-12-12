import { Cluster } from '@/integrations/api/api.patch';

export function getRestUrlForCluster(cluster: undefined | Pick<Cluster, 'fqdn'>): string | null {
	let fqdn = cluster?.fqdn;
	if (!fqdn) {
		return null;
	}
	if (!fqdn.match(/^https?:\/\//i)) {
		fqdn = `https://${fqdn}`;
	}
	return new URL(fqdn).toString();
}
