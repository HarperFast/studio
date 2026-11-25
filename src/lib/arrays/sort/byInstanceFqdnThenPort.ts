import { Instance } from '@/integrations/api/api.patch';
import { ipAddressToNumber } from '@/lib/numbers/ipAddressToNumber';
import { isIpAddress } from '@/lib/string/isIpAddress';
import { getInstanceAddress } from '@/lib/urls/getOperationsUrlForInstance';

export function byInstanceFqdnThenPort(
	a: Pick<Instance, 'instanceFqdn' | 'operationsApiPort'>,
	b: Pick<Instance, 'instanceFqdn' | 'operationsApiPort'>,
) {
	const aFqdn = getInstanceAddress(a) ?? '';
	const bFqdn = getInstanceAddress(b) ?? '';
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
