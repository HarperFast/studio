import { createHarperDataSource, EXTENSION_ROW_LIMIT } from '@/features/instance/extensions/dataSource';
import { AxiosError, AxiosHeaders, type AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';

function harper(respond: (body: Record<string, unknown>) => unknown) {
	const post = vi.fn(async (_path: string, body: Record<string, unknown>) => ({ data: respond(body) }));
	return { post, dataSource: createHarperDataSource('clu-1', { post } as unknown as AxiosInstance) };
}

const rows = (count: number) => Array.from({ length: count }, (_, index) => ({ id: index }));

function harperError(status: number, error: string) {
	const config = { headers: new AxiosHeaders() };
	return new AxiosError(error, AxiosError.ERR_BAD_REQUEST, config, undefined, {
		status,
		statusText: '',
		headers: {},
		config,
		data: { error },
	});
}

/** Refuses any read that names an attribute, as Harper does when one is missing or the role can't read it. */
function refusingNamedAttributes(status: number) {
	return harper((body) => {
		const attributes = body.get_attributes as string[];
		if (attributes[0] !== '*') {
			throw harperError(status, "unknown attribute 'colour'");
		}
		return rows(2);
	});
}

describe('createHarperDataSource', () => {
	it('loads at most the row limit, and says when the table holds more', async () => {
		const { post, dataSource } = harper(() => rows(EXTENSION_ROW_LIMIT + 1));
		const { records, truncated } = await dataSource.list('redirects', 'Rule', 'id', ['id']);
		expect(records).toHaveLength(EXTENSION_ROW_LIMIT);
		expect(truncated).toBe(true);
		expect(post.mock.calls[0][1]).toMatchObject({ operation: 'search_by_value', limit: EXTENSION_ROW_LIMIT + 1 });
	});

	it('reads only the attributes it is asked for', async () => {
		const { post, dataSource } = harper(() => rows(1));
		await dataSource.list('prerender', 'Page', 'path', ['path', 'status', 'renderedAt']);
		expect(post).toHaveBeenCalledTimes(1);
		expect(post.mock.calls[0][1]).toMatchObject({
			operation: 'search_by_value',
			search_attribute: 'path',
			search_value: '*',
			get_attributes: ['path', 'status', 'renderedAt'],
		});
	});

	it.each([
		[400, 'the table has no such attribute'],
		[403, "the role can't read one"],
	])('reads every attribute instead when Harper refuses one by name with a %i (%s)', async (status) => {
		const { post, dataSource } = refusingNamedAttributes(status);
		await expect(dataSource.list('prerender', 'Page', 'id', ['id', 'colour'])).resolves.toEqual({
			records: rows(2),
			truncated: false,
		});
		expect(post.mock.calls.map(([, body]) => body.get_attributes)).toEqual([['id', 'colour'], ['*']]);
	});

	it('fails any other way it fails, and never repeats a read of every attribute', async () => {
		const failing = harper(() => {
			throw harperError(500, 'Internal error');
		});
		await expect(failing.dataSource.list('prerender', 'Page', 'id', ['id'])).rejects.toThrow('Internal error');
		expect(failing.post).toHaveBeenCalledTimes(1);

		const refused = refusingNamedAttributes(400);
		refused.post.mockRejectedValue(harperError(400, 'bad'));
		await expect(refused.dataSource.list('prerender', 'Page', 'id', [])).rejects.toThrow('bad');
		expect(refused.post.mock.calls.map(([, body]) => body.get_attributes)).toEqual([['*']]);
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
