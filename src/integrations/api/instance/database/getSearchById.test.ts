import type { EntityIds } from '@/features/auth/store/authStore';
import { getSearchByIdOptions } from '@/integrations/api/instance/database/getSearchById';
import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';

// A row whose declared primary key has no value surfaces here as `null`/`undefined`. If it were
// sent, JSON.stringify turns it into `[null]`, which Harper rejects (500 'hash_values' must be
// strings or numbers) -- see #1199. These guard that it is filtered out before any request.
function makeClient(post = vi.fn()) {
	return { post } as unknown as AxiosInstance;
}

const base = {
	entityId: 'e1' as unknown as EntityIds,
	databaseName: 'data',
	tableName: 'Thing',
};

describe('getSearchByIdOptions', () => {
	it('disables the query when the only id is null (broken primary key)', () => {
		const opts = getSearchByIdOptions({ ...base, instanceClient: makeClient(), enabled: true, ids: [null] });
		expect(opts.enabled).toBe(false);
	});

	it('disables the query when ids is null', () => {
		const opts = getSearchByIdOptions({ ...base, instanceClient: makeClient(), enabled: true, ids: null });
		expect(opts.enabled).toBe(false);
	});

	it('sends only the valid ids, never null/undefined', () => {
		const post = vi.fn().mockResolvedValue({ data: [] });
		const opts = getSearchByIdOptions({
			...base,
			instanceClient: makeClient(post),
			enabled: true,
			ids: [null, 'abc', undefined, 5],
		});
		expect(opts.enabled).toBe(true);
		(opts.queryFn as () => unknown)();
		expect(post).toHaveBeenCalledWith('/', expect.objectContaining({ ids: ['abc', 5], operation: 'search_by_id' }));
	});

	it('honors a false enabled flag even with valid ids', () => {
		const opts = getSearchByIdOptions({ ...base, instanceClient: makeClient(), enabled: false, ids: ['abc'] });
		expect(opts.enabled).toBe(false);
	});
});
