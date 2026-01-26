import { describe, expect, it } from 'vitest';
import { extractDomainFromTLD } from './extractDomainFromTLD';

describe('extractDomainFromTLD', () => {
	it('should return @ for simple domains', () => {
		expect(extractDomainFromTLD('example.com')).toBe('@');
	});

	it('should return subdomain for simple domains', () => {
		expect(extractDomainFromTLD('foo.example.com')).toBe('foo');
	});

	it('should return @ for domains with multi-part TLDs', () => {
		expect(extractDomainFromTLD('example.co.uk')).toBe('@');
	});

	it('should return subdomain for domains with multi-part TLDs', () => {
		expect(extractDomainFromTLD('foo.example.co.uk')).toBe('foo');
	});

	it('should handle deeper subdomains', () => {
		expect(extractDomainFromTLD('bar.foo.example.com')).toBe('bar.foo');
		expect(extractDomainFromTLD('bar.foo.example.co.uk')).toBe('bar.foo');
	});

	it('should handle long TLDs', () => {
		expect(extractDomainFromTLD('example.photography')).toBe('@');
		expect(extractDomainFromTLD('sub.example.photography')).toBe('sub');
	});

	it('should handle ccTLDs without common SLDs', () => {
		expect(extractDomainFromTLD('example.de')).toBe('@');
		expect(extractDomainFromTLD('sub.example.de')).toBe('sub');
	});

	it('should handle other common multi-part TLDs', () => {
		expect(extractDomainFromTLD('example.com.br')).toBe('@');
		expect(extractDomainFromTLD('foo.example.com.br')).toBe('foo');
		expect(extractDomainFromTLD('example.org.au')).toBe('@');
		expect(extractDomainFromTLD('bar.example.org.au')).toBe('bar');
	});
});
