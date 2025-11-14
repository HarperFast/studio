import { describe, expect, it } from 'vitest';
import { isIpAddress } from './isIpAddress';

describe('isIpAddress', () => {
	it('returns true for valid IPv4 addresses', () => {
		const cases = ['127.0.0.1', '0.0.0.0', '255.255.255.255', '1.2.3.4', '10.0.0.254'];
		for (const value of cases) {
			expect(isIpAddress(value), value).toBe(true);
		}
	});

	it('returns false for hostnames/domains', () => {
		const cases = ['example.com', 'sub.domain.local', 'localhost'];
		for (const value of cases) {
			expect(isIpAddress(value), value).toBe(false);
		}
	});

	it('returns false for invalid IPv4 formats', () => {
		const cases = [
			'',
			'1',
			'1.2',
			'1.2.3',
			'1.2.3.4.5',
			'256.0.0.1',
			'1.2.3.256',
			'123.456.78.90',
			'01a.2.3.4',
			'1.2.3.4 ',
			' 1.2.3.4',
			'1.2.3.4abc',
			'::1',
		];
		for (const value of cases) {
			expect(isIpAddress(value), value).toBe(false);
		}
	});
});
