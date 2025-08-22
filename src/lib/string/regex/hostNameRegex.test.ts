import { hostNameRegex } from '@/lib/string/regex/hostNameRegex';
import { describe, expect, it } from 'vitest';

describe('host name regex', () => {
	it('accepts valid hosts', () => {
		const valids = [
			'',
			'localhost',
			'example.com',
			'sub.example.com',
			'a.co',
			'127.0.0.1',
			'1.3.3.7',
		];
		for (const v of valids) {
			expect(hostNameRegex.test(v)).toBe(true);
		}
	});

	it('rejects ports, schemes, paths, IPv6, and malformed hosts', () => {
		const invalids = [
			'127.0.0.1:123', // port on IPv4
			'bad.com:123', // port on domain
			'http://example.com', // scheme present
			'https://example.com', // scheme present
			'example.com/path', // path present
			'example', // no TLD (except localhost)
			'-bad.com', // starts with hyphen in label
			'bad-.com', // ends with hyphen in label
			'256.0.0.1', // invalid IPv4 segment
			'1.2.3', // not enough IPv4 segments
			'1234.5.6.7', // invalid IPv4 segment
			'sub..example.com', // empty label
			'[::1]', // IPv6 loopback with brackets
			'2001:db8::1', // IPv6
			'localhost:80', // localhost with port
		];
		for (const v of invalids) {
			expect(hostNameRegex.test(v)).toBe(false);
		}
	});
});
