import { Instance } from '@/integrations/api/api.patch';

export function getOperationsUrlForInstance(
	instance: Pick<Instance, 'instanceFqdn' | 'operationsApiSecure' | 'operationsApiPort'>,
): string | null {
	const url = parseInstanceFqdn(instance.instanceFqdn);
	if (!url) {
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

/**
 * The instance's FQDN, or null when `getOperationsUrlForInstance` can't make a URL from it (missing, blank, or only a
 * scheme), so a view that shows, copies or sorts by the address agrees with the ones that connect to it.
 */
export function getInstanceAddress({ instanceFqdn }: Pick<Instance, 'instanceFqdn'>): string | null {
	return instanceFqdn && parseInstanceFqdn(instanceFqdn) ? instanceFqdn.trim() : null;
}

function parseInstanceFqdn(rawFqdn: string | undefined): URL | null {
	const fqdn = rawFqdn?.trim();
	if (!fqdn) {
		return null;
	}
	try {
		return new URL(fqdn.match(/^https?:\/\//i) ? fqdn : `https://${fqdn}`);
	} catch {
		return null;
	}
}
