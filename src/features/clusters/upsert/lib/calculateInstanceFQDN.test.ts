import { defaultOperationsApiPort } from '@/config/constants';
import { describe, expect, it } from 'vitest';
import { calculateInstanceFQDN } from './calculateInstanceFQDN';

// Derive the instance type from the function parameter to avoid importing zod schema in tests
type Instance = Parameters<typeof calculateInstanceFQDN>[0];

const buildInstance = (overrides: Partial<Instance> = {}): Instance => ({
	secure: 'false',
	fqdn: 'Example.COM',
	...overrides,
});

describe('calculateInstanceFQDN', () => {
	it('uses https when secure is "true" and omits port when 443, lowercasing the URL', () => {
		const instance = buildInstance({ secure: 'true', port: 443 });
		expect(calculateInstanceFQDN(instance)).toBe('https://example.com');
	});

	it('uses http when secure is "false" and omits port when 80', () => {
		const instance = buildInstance({ secure: 'false', port: 80 });
		expect(calculateInstanceFQDN(instance)).toBe('http://example.com');
	});

	it('includes non-standard ports in the URL', () => {
		const instance = buildInstance({ secure: 'false', port: 8080 });
		expect(calculateInstanceFQDN(instance)).toBe('http://example.com:8080');
	});

	it('defaults to defaultOperationsApiPort when port is not provided', () => {
		const instance = buildInstance();
		expect(calculateInstanceFQDN(instance)).toBe(`http://example.com:${defaultOperationsApiPort}`);
	});

	it('handles conflicts between port and secure', () => {
		const instance = buildInstance({ secure: 'true', port: 80 });
		expect(calculateInstanceFQDN(instance)).toBe('http://example.com');
		const instance2 = buildInstance({ secure: 'false', port: 443 });
		expect(calculateInstanceFQDN(instance2)).toBe('https://example.com');
	});
});
