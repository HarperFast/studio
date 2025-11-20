import { SchemaHdbInstance } from '@/integrations/api/api.gen';
import { describe, expect, it } from 'vitest';
import { byInstanceFqdnThenPort } from './byInstanceFqdnThenPort';

type Item = Pick<SchemaHdbInstance, 'instanceFqdn' | 'operationsApiPort'>;

describe('byInstanceFqdnThenPort', () => {
	it('sorts by instanceFqdn ascending when FQDNs differ', () => {
		const items: Item[] = [
			{ instanceFqdn: 'z.example.com', operationsApiPort: 9000 },
			{ instanceFqdn: 'a.example.com', operationsApiPort: 8000 },
			{ instanceFqdn: 'm.example.com', operationsApiPort: 7000 },
		];

		const sorted = [...items].sort(byInstanceFqdnThenPort);

		expect(sorted.map((i) => i.instanceFqdn)).toEqual([
			'a.example.com',
			'm.example.com',
			'z.example.com',
		]);
	});

	it('when instanceFqdn is equal, sorts by operationsApiPort ascending', () => {
		const items: Item[] = [
			{ instanceFqdn: 'a.example.com', operationsApiPort: 9000 },
			{ instanceFqdn: 'a.example.com', operationsApiPort: 8000 },
			{ instanceFqdn: 'a.example.com', operationsApiPort: 7000 },
		];

		const sorted = [...items].sort(byInstanceFqdnThenPort);

		expect(sorted.map((i) => i.operationsApiPort)).toEqual([7000, 8000, 9000]);
	});

	it('returns 0 when both instanceFqdn and operationsApiPort are equal', () => {
		const a: Item = { instanceFqdn: 'same.example.com', operationsApiPort: 1234 };
		const b: Item = { instanceFqdn: 'same.example.com', operationsApiPort: 1234 };

		expect(byInstanceFqdnThenPort(a, b)).toBe(0);
		expect(byInstanceFqdnThenPort(b, a)).toBe(0);
	});
});
