import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { buildNearestRecordsRequest, searchNearestRecords } from './searchNearestRecords';
import { SearchStreamError } from './searchStreamError';

const BASE = {
	databaseName: 'vec',
	tableName: 'Doc',
	primaryKey: 'id',
	attribute: 'embedding',
	target: [1, 0, 0, 0],
	previewAttributes: ['title'],
	limit: 3,
};

const client = (data: unknown) => {
	const post = vi.fn(async () => ({ data }));
	return { post, instanceClient: { post } as unknown as AxiosInstance };
};

describe('buildNearestRecordsRequest', () => {
	it('sorts every record by its distance to the target, selecting $distance ahead of the record', () => {
		// The shape a real Harper 5.1.30 and 5.4.1 answered, nearest first.
		expect(buildNearestRecordsRequest(BASE)).toEqual({
			operation: 'search_by_value',
			database: 'vec',
			table: 'Doc',
			search_attribute: 'id',
			search_value: '*',
			get_attributes: ['$distance', 'id', 'title'],
			sort: { attribute: 'embedding', target: [1, 0, 0, 0] },
			limit: 3,
		});
	});
});

describe('searchNearestRecords', () => {
	it('sends the search once, without the gateway retry', async () => {
		const hits = [{ $distance: 0, id: 'a', title: 'cat' }, { $distance: 0.0061, id: 'b', title: 'kitten' }];
		const { post, instanceClient } = client(hits);
		await expect(searchNearestRecords({ ...BASE, instanceClient })).resolves.toEqual(hits);
		expect(post).toHaveBeenCalledWith('/', buildNearestRecordsRequest(BASE), { skipGatewayRetry: true });
	});

	it('fails on the trailing { error } Harper streams once its 200 has begun', async () => {
		const { instanceClient } = client([{ $distance: 0, id: 'a' }, { error: 'Index is not ready' }]);
		await expect(searchNearestRecords({ ...BASE, instanceClient })).rejects.toThrow(
			new SearchStreamError('Index is not ready'),
		);
	});

	it('fails on an answer that is not a list, and drops entries that are not records', async () => {
		await expect(searchNearestRecords({ ...BASE, ...client({ message: 'ok' }) })).rejects.toThrow(
			/something other than a list/,
		);
		await expect(searchNearestRecords({ ...BASE, ...client([null, 3, [], { $distance: 1, id: 'c' }]) }))
			.resolves.toEqual([{ $distance: 1, id: 'c' }]);
	});
});
