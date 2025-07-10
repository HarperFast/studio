import { describe, expect, it } from 'vitest';
import { getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';

describe('getOperationsUrlForInstance', () => {
	it('parses through the url', () => {
		expect(getOperationsUrlForInstance({
			instanceFqdn: 'http://localhost:1/',
			operationsApiPort: 1,
			operationsApiSecure: false,
		})).toBe('http://localhost:1/');
	});

	it('can add the port', () => {
		expect(getOperationsUrlForInstance({
			instanceFqdn: 'http://localhost/',
			operationsApiPort: 2,
			operationsApiSecure: false,
		})).toBe('http://localhost:2/');
	});

	it('can change the port', () => {
		expect(getOperationsUrlForInstance({
			instanceFqdn: 'http://localhost:1/',
			operationsApiPort: 2,
			operationsApiSecure: false,
		})).toBe('http://localhost:2/');
	});

	it('can change the protocol', () => {
		expect(getOperationsUrlForInstance({
			instanceFqdn: 'http://localhost:1/',
			operationsApiPort: 1,
			operationsApiSecure: true,
		})).toBe('https://localhost:1/');
	});

	it('can add the protocol', () => {
		expect(getOperationsUrlForInstance({
			instanceFqdn: 'localhost',
			operationsApiPort: 1,
			operationsApiSecure: true,
		})).toBe('https://localhost:1/');
	});
});
