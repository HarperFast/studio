import { createHarperDataSource, EXTENSION_ROW_LIMIT } from '@/features/instance/extensions/dataSource';
import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';

function harper(respond: (body: Record<string, unknown>) => unknown) {
	const post = vi.fn(async (_path: string, body: Record<string, unknown>) => ({ data: respond(body) }));
	return { post, dataSource: createHarperDataSource('clu-1', { post } as unknown as AxiosInstance) };
}

const rows = (count: number) => Array.from({ length: count }, (_, index) => ({ id: index }));

describe('createHarperDataSource', () => {
	it('loads at most the row limit, and says when the table holds more', async () => {
		const { post, dataSource } = harper(() => rows(EXTENSION_ROW_LIMIT + 1));
		const { records, truncated } = await dataSource.list('redirects', 'Rule', 'id');
		expect(records).toHaveLength(EXTENSION_ROW_LIMIT);
		expect(truncated).toBe(true);
		expect(post.mock.calls[0][1]).toMatchObject({ operation: 'search_by_value', limit: EXTENSION_ROW_LIMIT + 1 });
	});

	it("counts a whole table from describe_table, marking Harper's estimate", async () => {
		const { dataSource } = harper(() => ({ record_count: 120_000, estimated_record_range: [110_000, 130_000] }));
		await expect(dataSource.count('redirects', 'Rule')).resolves.toEqual({ count: 120_000, bound: 'estimate' });
	});

	it('counts a filter on the server, reading only primary keys up to the limit', async () => {
		const { post, dataSource } = harper((body) =>
			body.operation === 'describe_table' ? { primary_key: 'path' } : rows(EXTENSION_ROW_LIMIT + 1)
		);
		await expect(dataSource.count('redirects', 'Rule', { enabled: true })).resolves.toEqual({
			count: EXTENSION_ROW_LIMIT,
			bound: 'at-least',
		});
		expect(post.mock.calls[1][1]).toMatchObject({
			operation: 'search_by_conditions',
			conditions: [{ search_attribute: 'enabled', search_type: 'equals', search_value: true }],
			get_attributes: ['path'],
			limit: EXTENSION_ROW_LIMIT + 1,
		});
	});

	it('fails a write Harper skipped, which it answers with a 200', async () => {
		const { dataSource } = harper(() => ({ inserted_hashes: [], skipped_hashes: ['/a'] }));
		await expect(dataSource.insert('redirects', 'Rule', { id: '/a' })).rejects.toThrow(/already exists/);
		await expect(dataSource.update('redirects', 'Rule', { id: '/a' })).rejects.toThrow(/nothing is stored/);
		await expect(dataSource.remove('redirects', 'Rule', '/a')).rejects.toThrow(/nothing is stored/);
	});

	it('inserts and updates with the operations their buttons were offered on', async () => {
		const { post, dataSource } = harper(() => ({}));
		await dataSource.insert('redirects', 'Rule', { source: '/a' });
		await dataSource.update('redirects', 'Rule', { id: 1, source: '/b' });
		expect(post.mock.calls.map(([, body]) => body.operation)).toEqual(['insert', 'update']);
	});
});
