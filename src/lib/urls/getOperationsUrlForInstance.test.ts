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
	it.each([undefined, '', '   ', 'https://'])(
		'has no address for an FQDN of %j, which has no operations URL either',
		(instanceFqdn) => {
			expect(getInstanceAddress({ instanceFqdn })).toBeNull();
			expect(getOperationsUrlForInstance({ instanceFqdn, operationsApiPort: 9925, operationsApiSecure: true }))
				.toBeNull();
		},
	);

	it.each([' node.example.com', 'node.example.com ', '\tnode.example.com\n'])(
		'reads %j as node.example.com, on either side of the padding',
		(instanceFqdn) => {
			expect(getInstanceAddress({ instanceFqdn })).toBe('node.example.com');
			expect(getOperationsUrlForInstance({ instanceFqdn, operationsApiPort: 9925, operationsApiSecure: true }))
				.toBe('https://node.example.com:9925/');
		},
	);

	it('gives an IP address back as it is', () => {
		expect(getInstanceAddress({ instanceFqdn: '10.0.0.4' })).toBe('10.0.0.4');
	});
});
