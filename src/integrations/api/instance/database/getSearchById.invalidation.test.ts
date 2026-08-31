import { describe, expect, it } from 'vitest';
import { getSearchByIdOptions, searchByIdInvalidationKey } from './getSearchById';

// The original defect was a query-key mismatch that no test could see: the table-wide refresher's
// prefix didn't match the open record's key, so a landed write left the row editor's cached record
// showing the attribute the user had just removed. This pins the relationship rather than the string.
describe('searchByIdInvalidationKey', () => {
	const params = {
		entityId: 'ent-1',
		instanceClient: {} as never,
		databaseName: 'data',
		tableName: 'dog',
		enabled: true,
	};

	function prefixMatches(prefix: readonly unknown[], key: readonly unknown[]) {
		return prefix.every((part, index) => JSON.stringify(part) === JSON.stringify(key[index]));
	}

	it('is a prefix of the real search_by_id query key', () => {
		const { queryKey } = getSearchByIdOptions({ ...params, ids: ['abc-123'] });
		expect(prefixMatches(searchByIdInvalidationKey('ent-1', 'data', 'dog'), queryKey)).toBe(true);
	});

	it('matches regardless of which ids are open', () => {
		for (const ids of [['abc-123'], ['a', 'b'], null]) {
			const { queryKey } = getSearchByIdOptions({ ...params, ids });
			expect(prefixMatches(searchByIdInvalidationKey('ent-1', 'data', 'dog'), queryKey)).toBe(true);
		}
	});

	// The bug, stated as a test: the table-wide prefix cannot reach this key, which is why a second
	// invalidation exists at all.
	it("is not reachable from the table-wide prefix, which is why it's needed", () => {
		const { queryKey } = getSearchByIdOptions({ ...params, ids: ['abc-123'] });
		expect(prefixMatches(['ent-1', 'data', 'dog'], queryKey)).toBe(false);
	});

	it('does not match another table or database', () => {
		const { queryKey } = getSearchByIdOptions({ ...params, ids: ['abc-123'] });
		expect(prefixMatches(searchByIdInvalidationKey('ent-1', 'data', 'cat'), queryKey)).toBe(false);
		expect(prefixMatches(searchByIdInvalidationKey('ent-1', 'other', 'dog'), queryKey)).toBe(false);
	});
});
