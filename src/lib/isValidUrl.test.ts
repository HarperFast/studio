import { describe, expect, it } from 'vitest';
import { isValidUrl } from './isValidUrl';

describe('isValidUrl', () => {
	it('should return true for valid URLs', () => {
		expect(isValidUrl('https://example.com')).toBe(true);
		expect(isValidUrl('http://localhost:3000')).toBe(true);
		expect(isValidUrl('https://subdomain.example.com/path?query=string#hash')).toBe(true);
		expect(isValidUrl('ftp://ftp.example.com')).toBe(true);
	});

	it('should return false for invalid URLs', () => {
		expect(isValidUrl('')).toBe(false);
		expect(isValidUrl('not a url')).toBe(false);
		expect(isValidUrl('http://')).toBe(false);
		expect(isValidUrl('example.com')).toBe(false); // Missing protocol
		expect(isValidUrl('https://')).toBe(false);
	});
});
