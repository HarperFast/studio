import {
	createHarperDataSource,
	EXTENSION_ROW_LIMIT,
	UnconfirmedWriteError,
} from '@/features/instance/extensions/dataSource';
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

	it('counts an empty table as an exact 0', async () => {
		const { dataSource } = harper(() => ({ record_count: 0 }));
		await expect(dataSource.count('redirects', 'Rule')).resolves.toEqual({ count: 0, bound: 'exact' });
	});

	it.each([
		['an HTML page from something in front of Harper', '<html><body>OK</body></html>'],
		['an empty body', ''],
		['a list', [{ record_count: 3 }]],
	])('fails a whole-table count answered with %s, rather than show it as an exact 0', async (_case, answer) => {
		const { dataSource } = harper(() => answer);
		await expect(dataSource.count('redirects', 'Rule')).rejects.toThrow(/wasn't a table description/);
	});

	it("fails a whole-table count Harper couldn't make, which it answers without record_count", async () => {
		const { dataSource } = harper(() => ({ name: 'Rule', table_size: 4096 }));
		await expect(dataSource.count('redirects', 'Rule')).rejects.toThrow("Harper couldn't count this table's records.");
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

	const writes = [
		['insert', 'inserted_hashes', /already exists/],
		['update', 'update_hashes', /nothing is stored/],
	] as const;

	it.each(writes)('resolves an %s only once the answer names the key in %s', async (method, written) => {
		const { dataSource } = harper(() => ({ [written]: ['/a'], skipped_hashes: [] }));
		await expect(dataSource[method]('redirects', 'Rule', { id: '/a', source: '/x' }, 'id')).resolves.toBeUndefined();
	});

	it.each(writes)('matches an %s of a composite key that comes back as a new array', async (method, written) => {
		const { dataSource } = harper(() => ({ [written]: [['eu', 7]], skipped_hashes: [] }));
		await expect(dataSource[method]('redirects', 'Rule', { id: ['eu', 7] }, 'id')).resolves.toBeUndefined();
	});

	it('checks the key under the primary key it is told, not under `id`', async () => {
		const { dataSource } = harper(() => ({ inserted_hashes: ['/p'], skipped_hashes: [] }));
		await expect(dataSource.insert('prerender', 'Page', { id: 'x', path: '/p' }, 'path')).resolves.toBeUndefined();
		await expect(dataSource.insert('prerender', 'Page', { id: '/p', path: '/q' }, 'path')).rejects.toBeInstanceOf(
			UnconfirmedWriteError,
		);
	});

	it('accepts an insert without a key once Harper lists the one record it wrote under the key it made up', async () => {
		const { dataSource } = harper(() => ({ inserted_hashes: ['9f2c-generated'], skipped_hashes: [] }));
		await expect(dataSource.insert('redirects', 'Rule', { source: '/a' }, 'id')).resolves.toBeUndefined();
		await expect(dataSource.insert('redirects', 'Rule', { id: null, source: '/a' }, 'id')).resolves.toBeUndefined();
	});

	it('never takes the count alone as proof of an update, which always names its key', async () => {
		const { dataSource } = harper(() => ({ update_hashes: ['/b'], skipped_hashes: [] }));
		await expect(dataSource.update('redirects', 'Rule', { source: '/a' }, 'id')).rejects.toBeInstanceOf(
			UnconfirmedWriteError,
		);
	});

	it.each(writes)('fails an %s Harper answered but skipped, as a plain failure', async (method, written, message) => {
		const { dataSource } = harper(() => ({ [written]: [], skipped_hashes: ['/a'] }));
		const failure = await dataSource[method]('redirects', 'Rule', { id: '/a' }, 'id').catch((error: unknown) => error);
		expect(failure).not.toBeInstanceOf(UnconfirmedWriteError);
		expect((failure as Error).message).toMatch(message);
	});

	it.each(writes)('fails an %s Harper answered as writing nothing, as a plain failure', async (method, written) => {
		const { dataSource } = harper(() => ({ [written]: [], skipped_hashes: [] }));
		const failure = await dataSource[method]('redirects', 'Rule', { id: '/a' }, 'id').catch((error: unknown) => error);
		expect(failure).toBeInstanceOf(Error);
		expect(failure).not.toBeInstanceOf(UnconfirmedWriteError);
		expect((failure as Error).message).toMatch(/nothing/);
	});

	describe.each(writes)(
		'never reports an %s as done, nor as a plain failure, when answered with',
		(method, written) => {
			it.each([
				['an empty body', ''],
				['an HTML page from something in front of Harper', '<html><body>OK</body></html>'],
				['an empty object', {}],
				[`no ${written}`, { message: 'inserted 1 of 1 records', skipped_hashes: [] }],
				['a different key', { [written]: ['/b'], skipped_hashes: [] }],
				['a key it skipped as well', { [written]: ['/a'], skipped_hashes: ['/a'] }],
				['an unreadable skipped_hashes', { [written]: ['/a'], skipped_hashes: 'none' }],
				[`an unreadable ${written}`, { [written]: '/a', skipped_hashes: [] }],
			])('%s', async (_case, answer) => {
				const { dataSource } = harper(() => answer);
				await expect(dataSource[method]('redirects', 'Rule', { id: '/a' }, 'id')).rejects.toBeInstanceOf(
					UnconfirmedWriteError,
				);
			});

			it('an empty body, for a record sent without a key', async () => {
				const { dataSource } = harper(() => '');
				await expect(dataSource[method]('redirects', 'Rule', { source: '/a' }, 'id')).rejects.toBeInstanceOf(
					UnconfirmedWriteError,
				);
			});
		},
	);

	it("deletes by hash_values, the key Harper's validator requires", async () => {
		const { post, dataSource } = harper(() => ({ deleted_hashes: ['/a'], skipped_hashes: [] }));
		await expect(dataSource.remove('redirects', 'Rule', '/a')).resolves.toBeUndefined();
		expect(post.mock.calls[0][1]).toEqual({
			operation: 'delete',
			database: 'redirects',
			table: 'Rule',
			hash_values: ['/a'],
		});
	});

	it('deletes only once the answer names the key, matching a composite key that comes back as a new array', async () => {
		const { dataSource } = harper(() => ({ deleted_hashes: [['eu', 7]] }));
		await expect(dataSource.remove('redirects', 'Rule', ['eu', 7])).resolves.toBeUndefined();
	});

	it.each([
		['skipped it', { deleted_hashes: [], skipped_hashes: ['/a'] }, /nothing is stored/],
		["found nothing (Harper's not-found path counts the keys)", { deleted_hashes: [], skipped_hashes: [1] }, /nothing/],
		['deleted nothing, saying no more', { deleted_hashes: [] }, /deleted nothing/],
	])('fails a delete Harper answered but %s, as a plain failure', async (_case, answer, message) => {
		const { dataSource } = harper(() => answer);
		const failure = await dataSource.remove('redirects', 'Rule', '/a').catch((error: unknown) => error);
		expect(failure).toBeInstanceOf(Error);
		expect(failure).not.toBeInstanceOf(UnconfirmedWriteError);
		expect((failure as Error).message).toMatch(message);
	});

	it.each([
		['an empty body', ''],
		['an HTML page from something in front of Harper', '<html><body>OK</body></html>'],
		['no deleted_hashes', { message: '1 of 1 record successfully deleted' }],
		['a different key', { deleted_hashes: ['/b'], skipped_hashes: [] }],
		['a key it skipped as well', { deleted_hashes: ['/a'], skipped_hashes: ['/a'] }],
		['an unreadable skipped_hashes', { deleted_hashes: ['/a'], skipped_hashes: 'none' }],
	])('never reports a delete answered with %s as done, nor as a plain failure', async (_case, answer) => {
		const { dataSource } = harper(() => answer);
		await expect(dataSource.remove('redirects', 'Rule', '/a')).rejects.toBeInstanceOf(UnconfirmedWriteError);
	});

	it("reads a form's record as only its key and fields", async () => {
		const { post, dataSource } = harper(() => [{ id: 'default', origin: 'https://a.example' }]);
		await expect(dataSource.get('prerender', 'Settings', 'id', 'default', ['origin', 'id'])).resolves.toEqual({
			id: 'default',
			origin: 'https://a.example',
		});
		expect(post).toHaveBeenCalledTimes(1);
		expect(post.mock.calls[0][1]).toEqual({
			operation: 'search_by_id',
			database: 'prerender',
			table: 'Settings',
			ids: ['default'],
			get_attributes: ['id', 'origin'],
		});
	});

	it('reads no record when none is stored under the key', async () => {
		const { dataSource } = harper(() => []);
		await expect(dataSource.get('prerender', 'Settings', 'id', 'default', ['origin'])).resolves.toBeUndefined();
	});

	const notRecords = [
		['an HTML page from something in front of Harper', '<html><body>OK</body></html>'],
		['an empty body', ''],
		['an object', { id: 'default' }],
		['a list of something else', ['default']],
		['a list holding null', [null]],
		['a list of lists', [['default']]],
	] as const;

	it.each(notRecords)("fails a record read answered with %s, rather than make it the form's record", async (
		_case,
		answer,
	) => {
		const { dataSource } = harper(() => answer);
		await expect(dataSource.get('prerender', 'Settings', 'id', 'default', ['origin'])).rejects.toThrow(
			/wasn't a list of records/,
		);
	});

	it.each(notRecords)('fails a table read or filtered count answered with %s', async (_case, answer) => {
		const { dataSource } = harper((body) => body.operation === 'describe_table' ? { primary_key: 'id' } : answer);
		await expect(dataSource.list('redirects', 'Rule', 'id', ['id'])).rejects.toThrow(/wasn't a list of records/);
		await expect(dataSource.count('redirects', 'Rule', { enabled: true })).rejects.toThrow(/wasn't a list of records/);
	});

	it.each([400, 403])(
		'reads every attribute of a record instead when Harper refuses one by name with a %i',
		async (status) => {
			const { post, dataSource } = refusingNamedAttributes(status);
			await expect(dataSource.get('prerender', 'Settings', 'id', 0, ['colour'])).resolves.toEqual({ id: 0 });
			expect(post.mock.calls.map(([, body]) => body.get_attributes)).toEqual([['id', 'colour'], ['*']]);
		},
	);

	it('fails a record read any other way it fails, without reading it again', async () => {
		const { post, dataSource } = harper(() => {
			throw harperError(500, 'Internal error');
		});
		await expect(dataSource.get('prerender', 'Settings', 'id', 'default', ['origin'])).rejects.toThrow(
			'Internal error',
		);
		expect(post).toHaveBeenCalledTimes(1);
	});

	it('inserts and updates with the operations their buttons were offered on', async () => {
		const { post, dataSource } = harper((body) =>
			body.operation === 'insert' ? { inserted_hashes: ['new'], skipped_hashes: [] } : { update_hashes: [1] }
		);
		await dataSource.insert('redirects', 'Rule', { source: '/a' }, 'id');
		await dataSource.update('redirects', 'Rule', { id: 1, source: '/b' }, 'id');
		expect(post.mock.calls.map(([, body]) => body)).toEqual([
			{ operation: 'insert', database: 'redirects', table: 'Rule', records: [{ source: '/a' }] },
			{ operation: 'update', database: 'redirects', table: 'Rule', records: [{ id: 1, source: '/b' }] },
		]);
	});
});
