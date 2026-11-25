import { getInstanceAddress, getOperationsUrlForInstance } from '@/lib/urls/getOperationsUrlForInstance';
import { describe, expect, it } from 'vitest';

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

	it.each([undefined, '', '   ', 'https://'])('has no URL for an instance whose FQDN is %j', (instanceFqdn) => {
		expect(getOperationsUrlForInstance({
			instanceFqdn,
			operationsApiPort: 9925,
			operationsApiSecure: true,
		})).toBeNull();
	});
});

describe('getInstanceAddress', () => {
	it.each([undefined, '', '   ', 'https://', ' node.example.com'])(
		'has no address for an FQDN of %j, which has no operations URL either (#2022)',
		(instanceFqdn) => {
			expect(getInstanceAddress({ instanceFqdn })).toBeNull();
			expect(getOperationsUrlForInstance({ instanceFqdn, operationsApiPort: 9925, operationsApiSecure: true }))
				.toBeNull();
		},
	);

	it('gives the FQDN back without padding a URL ignores', () => {
		expect(getInstanceAddress({ instanceFqdn: 'node.example.com ' })).toBe('node.example.com');
		expect(getInstanceAddress({ instanceFqdn: '10.0.0.4' })).toBe('10.0.0.4');
	});
});
