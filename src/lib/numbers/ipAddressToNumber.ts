export function ipAddressToNumber(ipAddress: string): number {
	const parts = ipAddress.split('.').map(Number);
	// Coerce result to an unsigned 32-bit integer to avoid negative values for >= 128.0.0.0
	return (((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0);
}
