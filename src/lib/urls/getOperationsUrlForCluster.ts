import { Cluster } from '@/lib/api.patch';
import { defaultOperationsApiPort, defaultOperationsApiSecure } from '@/config/constants';

export function getOperationsUrlForCluster(cluster: undefined | Pick<Cluster, 'fqdn'>): string | null {
	let fqdn = cluster?.fqdn;
	if (!fqdn) {
		return null;
	}
	if (!fqdn.match(/^https?:\/\//i)) {
		fqdn = `https://${fqdn}`;
	}
	const url = new URL(fqdn);
	if (!fqdn.match(/:\d+/)) {
		url.port = String(defaultOperationsApiPort);
	}
	if (!fqdn.includes('://')) {
		url.protocol = defaultOperationsApiSecure ? 'https:' : 'http:';
	}
	// if (cluster.operationsApiPort) {
	// 	url.port = String(cluster.operationsApiPort);
	// }
	// if (cluster.operationsApiSecure !== undefined) {
	// 	url.protocol = cluster.operationsApiSecure ? 'https:' : 'http:';
	// }
	return url.toString();
}
