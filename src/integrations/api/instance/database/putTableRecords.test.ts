import { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import {
	describeIncompletePut,
	PUT_OPERATION_MIN_VERSION,
	putTableRecords,
	replaceRecordsBlockedReason,
	supportsPutOperation,
} from './putTableRecords';

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
		const instanceClient = {
			post: vi.fn().mockResolvedValue({ data: { put_hashes: ['abc-123'] } }),
		} as unknown as AxiosInstance;
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

	// The transport doesn't assert, mirroring the update path: a throw would skip the caller's cache
	// invalidation, so a write that landed but answered unreadably would leave stale data on screen.
	it('returns an incomplete result rather than throwing', async () => {
		const instanceClient = {
			post: vi.fn().mockResolvedValue({ data: { put_hashes: [] } }),
		} as unknown as AxiosInstance;

		await expect(
			putTableRecords({ databaseName: 'data', tableName: 'dog', records: [{ id: 'a' }], instanceClient }),
		).resolves.toEqual({ put_hashes: [] });
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

describe('replaceRecordsBlockedReason', () => {
	it('allows the save when the instance is new enough and the role has the grants', () => {
		expect(replaceRecordsBlockedReason('5.3.0', true)).toBeUndefined();
	});

	// An unread version is not an old one. Collapsing the two sends the user to upgrade an instance
	// that may already support the operation.
	it('reports an unresolved version as unknown, not as too old', () => {
		expect(replaceRecordsBlockedReason(undefined, true)).toBe('unknown');
		expect(replaceRecordsBlockedReason(undefined, false)).toBe('unknown');
	});

	it('reports an old instance as a version problem even when grants are missing too', () => {
		// Nothing can be granted on an instance that lacks the operation, so version is the useful answer.
		expect(replaceRecordsBlockedReason('5.2.6', false)).toBe('version');
		expect(replaceRecordsBlockedReason('5.2.6', true)).toBe('version');
	});

	it('reports missing grants as a permission problem on a supported instance', () => {
		expect(replaceRecordsBlockedReason('5.3.0', false)).toBe('permission');
	});
});

describe('describeIncompletePut', () => {
	it('says nothing when every record was written', () => {
		expect(describeIncompletePut({ message: 'put 1 of 1 records', put_hashes: ['a'] }, 1)).toBeUndefined();
	});

	it('describes a short write, and reports that nothing landed', () => {
		const incomplete = describeIncompletePut({ message: 'put 1 of 1 records', put_hashes: [] }, 1);
		expect(incomplete?.message).toMatch(/writing 0 of 1 records/);
		expect(incomplete?.wroteNothing).toBe(true);
	});

	it('does not claim nothing landed on a partial batch', () => {
		expect(describeIncompletePut({ message: '', put_hashes: ['a'] }, 2)?.wroteNothing).toBe(false);
	});

	// `put` only ever goes to a 5.3+ instance, which always sets the field, so an absent one didn't
	// come from a healthy Harper answering this operation. Undecidable, so the caller still refreshes.
	it('describes a missing or malformed put_hashes without claiming nothing landed', () => {
		const missing = describeIncompletePut({ message: '' } as never, 1);
		expect(missing?.message).toMatch(/didn't report which records it wrote/);
		expect(missing?.wroteNothing).toBe(false);
		expect(describeIncompletePut({ put_hashes: 'a' as unknown as unknown[] } as never, 1)?.message)
			.toMatch(/didn't report which records it wrote/);
	});
});
