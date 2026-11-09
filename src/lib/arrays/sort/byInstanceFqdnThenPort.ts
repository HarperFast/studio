import { Instance } from '@/integrations/api/api.patch';
import { ipAddressToNumber } from '@/lib/numbers/ipAddressToNumber';
import { isIpAddress } from '@/lib/string/isIpAddress';

export function byInstanceFqdnThenPort(
	a: Pick<Instance, 'instanceFqdn' | 'operationsApiPort'>,
	b: Pick<Instance, 'instanceFqdn' | 'operationsApiPort'>,
) {
	const aFqdn = a.instanceFqdn || '';
	const bFqdn = b.instanceFqdn || '';
	if (aFqdn === bFqdn) {
		return a.operationsApiPort - b.operationsApiPort;
	}
	if (!aFqdn || !bFqdn) {
		return aFqdn ? -1 : 1;
	}
	if (isIpAddress(aFqdn) && isIpAddress(bFqdn)) {
		return ipAddressToNumber(aFqdn) - ipAddressToNumber(bFqdn);
	}
	return aFqdn > bFqdn ? 1 : -1;
}
