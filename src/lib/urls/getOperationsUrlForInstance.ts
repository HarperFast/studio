import { Instance } from '@/integrations/api/api.patch';

export function getOperationsUrlForInstance(
	instance: Pick<Instance, 'instanceFqdn' | 'operationsApiSecure' | 'operationsApiPort'>,
): string | null {
	let fqdn = instance.instanceFqdn;
	if (!fqdn) {
		return null;
	}
	if (!fqdn.match(/^https?:\/\//i)) {
		fqdn = `https://${fqdn}`;
	}
	let url: URL;
	try {
		url = new URL(fqdn);
	} catch {
		return null;
	}
	if (instance.operationsApiPort) {
		url.port = String(instance.operationsApiPort);
	}
	if (instance.operationsApiSecure !== undefined) {
		url.protocol = instance.operationsApiSecure ? 'https:' : 'http:';
	}
	return url.toString();
}
