import { Instance } from '@/lib/api.patch';

export function getOperationsUrlForInstance(instance: Instance): string {
	const url = new URL(instance.instanceFqdn!);
	if (instance.operationsApiPort) {
		url.port = String(instance.operationsApiPort);
	}
	if (instance.operationsApiSecure !== undefined) {
		url.protocol = instance.operationsApiSecure ? 'https:' : 'http:';
	}
	return url.toString();
}
