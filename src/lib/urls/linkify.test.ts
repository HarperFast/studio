import { describe, expect, it } from 'vitest';
import { linkify } from './linkify';

describe('linkify', () => {
	it('should add https:// prefix if no protocol is present', () => {
		expect(linkify('example.com')).toBe('https://example.com/');
	});

	it('should preserve http:// protocol', () => {
		expect(linkify('http://example.com')).toBe('http://example.com/');
	});

	it('should preserve https:// protocol', () => {
		expect(linkify('https://example.com')).toBe('https://example.com/');
	});

	it('should handle subdomains and paths', () => {
		expect(linkify('sub.example.com/path/to/resource')).toBe('https://sub.example.com/path/to/resource');
	});

	it('should be case-insensitive when checking for protocol', () => {
		expect(linkify('HTTP://example.com')).toBe('http://example.com/');
		expect(linkify('Https://example.com')).toBe('https://example.com/');
	});

	it('should handle fqdn with port', () => {
		expect(linkify('localhost:3000')).toBe('https://localhost:3000/');
	});

	it('should throw error for invalid URL strings that cannot be parsed by URL constructor', () => {
		// URL constructor throws if the resulting string is not a valid URL
		expect(() => linkify('!!@@##')).toThrow();
	});
});
