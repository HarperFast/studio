import { SchemaHdbInstance } from '@/integrations/api/api.gen';
import { ipAddressToNumber } from '@/lib/numbers/ipAddressToNumber';
import { isIpAddress } from '@/lib/string/isIpAddress';

export function byInstanceFqdnThenPort(
	a: Pick<SchemaHdbInstance, 'instanceFqdn' | 'operationsApiPort'>,
	b: Pick<SchemaHdbInstance, 'instanceFqdn' | 'operationsApiPort'>,
) {
	if (a.instanceFqdn === b.instanceFqdn) {
		return a.operationsApiPort - b.operationsApiPort;
	}
	if (isIpAddress(a.instanceFqdn) && isIpAddress(b.instanceFqdn)) {
		return ipAddressToNumber(a.instanceFqdn) - ipAddressToNumber(b.instanceFqdn);
	}
	return a.instanceFqdn > b.instanceFqdn ? 1 : -1;
}
