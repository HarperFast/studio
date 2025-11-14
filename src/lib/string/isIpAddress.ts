export function isIpAddress(value: string | unknown): boolean {
	if (typeof value !== 'string') {
		return false;
	}
	// Strict IPv4 check: exactly four octets, each 0–255; no extra chars
	const ipv4 = /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
	return ipv4.test(value);
}
