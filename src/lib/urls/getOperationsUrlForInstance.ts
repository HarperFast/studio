import { Instance } from '@/integrations/api/api.patch';

export function getOperationsUrlForInstance(
	instance: Pick<Instance, 'instanceFqdn' | 'operationsApiSecure' | 'operationsApiPort'>,
): string {
	let fqdn = instance.instanceFqdn;
	if (!fqdn.match(/^https?:\/\//i)) {
		fqdn = `https://${fqdn}`;
	}
	const url = new URL(fqdn);
	if (instance.operationsApiPort) {
		url.port = String(instance.operationsApiPort);
	}
	if (instance.operationsApiSecure !== undefined) {
		url.protocol = instance.operationsApiSecure ? 'https:' : 'http:';
	}
	return url.toString();
}
