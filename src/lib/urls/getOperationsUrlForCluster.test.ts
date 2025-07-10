import { describe, expect, it } from 'vitest';
import { getOperationsUrlForCluster } from '@/lib/urls/getOperationsUrlForCluster';

describe('getOperationsUrlForCluster', () => {
	it('handles a missing fqdn', () => {
		expect(getOperationsUrlForCluster({
			fqdn: undefined,
		})).toBe(null);
	});

	it('parses through the url', () => {
		expect(getOperationsUrlForCluster({
			fqdn: 'http://localhost:1/',
		})).toBe('http://localhost:1/');
	});

	it('can add the protocol', () => {
		expect(getOperationsUrlForCluster({
			fqdn: 'localhost',
		})).toBe('https://localhost/');
	});
});
