import { describe, expect, it } from 'vitest';
import { isValidGraphqlName } from './graphqlName';

describe('isValidGraphqlName', () => {
	it('accepts valid GraphQL type/field names', () => {
		for (const name of ['Product', '_private', 'a1', 'my_Table_2', 'ID', 'x']) {
			expect(isValidGraphqlName(name)).toBe(true);
		}
	});

	it('rejects names that would produce invalid SDL', () => {
		for (const name of ['my table', '1abc', 'a-b', 'a.b', 'a/b', 'na`me', '', ' ', 'ünïcode']) {
			expect(isValidGraphqlName(name)).toBe(false);
		}
	});
});
