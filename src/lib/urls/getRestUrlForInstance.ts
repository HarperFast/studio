import { Instance } from '@/integrations/api/api.patch';

export function getRestUrlForInstance(
	instance: Pick<Instance, 'instanceFqdn'>,
): string {
	let fqdn = instance.instanceFqdn;
	if (!fqdn.match(/^https?:\/\//i)) {
		fqdn = `https://${fqdn}`;
	}
	const url = new URL(fqdn);
	return url.toString();
}
