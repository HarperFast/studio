import { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { PUT_OPERATION_MIN_VERSION, putTableRecords, supportsPutOperation } from './putTableRecords';

describe('supportsPutOperation', () => {
	it('accepts the release that added the operation and anything after it', () => {
		expect(supportsPutOperation('5.3.0')).toBe(true);
		expect(supportsPutOperation('5.3.1')).toBe(true);
		expect(supportsPutOperation('5.4.0')).toBe(true);
		expect(supportsPutOperation('6.0.0')).toBe(true);
	});

	it('refuses every release before it', () => {
		// The versions Studio actually manages today, all of which can only merge.
		expect(supportsPutOperation('5.2.6')).toBe(false);
		expect(supportsPutOperation('5.2.0')).toBe(false);
		expect(supportsPutOperation('5.0.0')).toBe(false);
		expect(supportsPutOperation('4.7.19')).toBe(false);
	});

	// A prerelease of the release that adds it does NOT have it: 5.3.0-alpha.1 predates 5.3.0 under
	// SemVer, and the operation landed for the final. Erring this way makes the editor refuse rather
	// than send an `update` that would report success and silently keep the attribute.
	it('refuses a prerelease of the adding release', () => {
		expect(supportsPutOperation('5.3.0-alpha.1')).toBe(false);
		expect(supportsPutOperation('5.3.0-beta.2')).toBe(false);
	});

	// `registration_info` may not have resolved yet, or an instance may not report a version at all.
	// Unknown has to read as unsupported for the same reason: the failure mode of guessing wrong in
	// the other direction is a silent no-op write.
	it('treats an unknown version as unsupported', () => {
		expect(supportsPutOperation(undefined)).toBe(false);
		expect(supportsPutOperation('')).toBe(false);
		expect(supportsPutOperation('not-a-version')).toBe(false);
	});

	it('names the release in one place', () => {
		expect(PUT_OPERATION_MIN_VERSION).toBe('5.3.0');
	});
});

describe('putTableRecords', () => {
	// The operation name is the whole fix. A regression to `update`/`upsert` here would merge instead
	// of replace and silently restore #1643, and every version-predicate test above would stay green.
	it('posts the put operation with the database, table, and records', async () => {
		const instanceClient = {
			post: vi.fn().mockResolvedValue({ data: { message: 'updated 1 of 1 records', put_hashes: ['abc-123'] } }),
		} as unknown as AxiosInstance;

		const result = await putTableRecords({
			databaseName: 'data',
			tableName: 'dog',
			records: [{ id: 'abc-123', name: 'Penny' }],
			instanceClient,
		});

		expect(instanceClient.post).toHaveBeenCalledWith('/', {
			operation: 'put',
			database: 'data',
			table: 'dog',
			records: [{ id: 'abc-123', name: 'Penny' }],
		});
		expect(result).toEqual({ message: 'updated 1 of 1 records', put_hashes: ['abc-123'] });
	});

	it('sends the records exactly as given, so an omitted attribute stays omitted', async () => {
		const instanceClient = { post: vi.fn().mockResolvedValue({ data: {} }) } as unknown as AxiosInstance;
		// `city` is deliberately absent: that absence is what removes it.
		await putTableRecords({
			databaseName: 'data',
			tableName: 'dog',
			records: [{ id: 'abc-123', name: 'Penny' }],
			instanceClient,
		});

		const body = vi.mocked(instanceClient.post).mock.calls[0][1] as { records: Record<string, unknown>[] };
		expect(Object.keys(body.records[0])).toEqual(['id', 'name']);
	});

	it('propagates a failed write rather than reporting success', async () => {
		const instanceClient = {
			post: vi.fn().mockRejectedValue(new Error('Unauthorized')),
		} as unknown as AxiosInstance;

		await expect(
			putTableRecords({ databaseName: 'data', tableName: 'dog', records: [{ id: 'a' }], instanceClient }),
		).rejects.toThrow('Unauthorized');
	});
});
