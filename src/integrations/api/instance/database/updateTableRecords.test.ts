import { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { describeIncompleteUpdate, updateTableRecords } from './updateTableRecords';

function client(data: unknown) {
	return { post: vi.fn().mockResolvedValue({ data }) } as unknown as AxiosInstance;
}

const one = [{ id: 'abc-123', name: 'Ada' }];
const hashes = (value: unknown) => value as unknown as unknown[];

describe('updateTableRecords', () => {
	it('posts the update operation with the database, table, and records', async () => {
		const instanceClient = client({ message: 'updated 1 of 1 records', update_hashes: ['abc-123'] });

		await updateTableRecords({ databaseName: 'data', tableName: 'dog', records: one, instanceClient });

		expect(instanceClient.post).toHaveBeenCalledWith('/', {
			operation: 'update',
			database: 'data',
			table: 'dog',
			records: one,
		});
	});

	// The writer stays a transport: it is shared with the chat agent tool, whose caller must still
	// reach its own `invalidateQueries` and report `skipped_hashes` on a partially committed batch.
	// Asserting here turned a 9-of-10 durable write into a total failure with a stale cache.
	it('returns a partial write rather than throwing, so shared callers keep their own handling', async () => {
		const instanceClient = client({ update_hashes: ['abc-123'], skipped_hashes: ['def-456'] });

		await expect(
			updateTableRecords({ databaseName: 'data', tableName: 'dog', records: one, instanceClient }),
		).resolves.toEqual({ update_hashes: ['abc-123'], skipped_hashes: ['def-456'] });
	});

	it('propagates a transport failure', async () => {
		const instanceClient = { post: vi.fn().mockRejectedValue(new Error('Unauthorized')) } as unknown as AxiosInstance;

		await expect(updateTableRecords({ databaseName: 'data', tableName: 'dog', records: one, instanceClient }))
			.rejects.toThrow('Unauthorized');
	});
});

describe('describeIncompleteUpdate', () => {
	it('says nothing when every record was written', () => {
		expect(describeIncompleteUpdate({ update_hashes: ['a'], skipped_hashes: [] }, 1)).toBeUndefined();
	});

	// Harper answers 200 with the record named in `skipped_hashes` when nothing is stored under its
	// key. Reporting that as success is #1643 by another route.
	it('describes a skipped record', () => {
		const incomplete = describeIncompleteUpdate({ update_hashes: [], skipped_hashes: ['a'] }, 1);
		expect(incomplete?.message).toMatch(/updated 0 of 1 records and skipped 1/);
	});

	it('describes a short write with no skip list', () => {
		expect(describeIncompleteUpdate({ update_hashes: ['a'] }, 2)?.message).toMatch(/updated 1 of 2 records/);
	});

	// A field present but unreadable is not the legacy case: that responder does answer this
	// operation, so its answer can't be taken as success.
	it('describes a present-but-malformed update_hashes', () => {
		expect(describeIncompleteUpdate({ update_hashes: hashes('abc') }, 1)?.message)
			.toMatch(/didn't report which records it wrote/);
	});

	it('describes a present-but-malformed skipped_hashes', () => {
		expect(describeIncompleteUpdate({ update_hashes: ['a'], skipped_hashes: hashes('no') }, 1)?.message)
			.toMatch(/didn't report which records it wrote/);
	});

	// Fails open only here: `update` reaches back to 4.7, and an unrecognized legacy shape is not
	// evidence of failure.
	it('treats absent fields as complete', () => {
		expect(describeIncompleteUpdate({ message: 'updated 1 of 1 records' }, 1)).toBeUndefined();
		expect(describeIncompleteUpdate(undefined, 1)).toBeUndefined();
	});

	// The browse caller skips its cache invalidation on this: refetching resets an editor that still
	// holds the user's draft, and a write that landed nothing has nothing new to read anyway.
	it('reports plainly when nothing was written', () => {
		expect(describeIncompleteUpdate({ update_hashes: [], skipped_hashes: ['a'] }, 1)?.wroteNothing).toBe(true);
	});

	it('does not claim nothing was written when some records landed', () => {
		expect(describeIncompleteUpdate({ update_hashes: ['a'], skipped_hashes: ['b'] }, 2)?.wroteNothing).toBe(false);
	});

	// Undecidable, so the caller still refreshes: something may have landed.
	it('does not claim nothing was written when the answer is unreadable', () => {
		expect(describeIncompleteUpdate({ update_hashes: hashes('x') }, 1)?.wroteNothing).toBe(false);
	});

	it('does not claim nothing was written when the fields are absent', () => {
		expect(describeIncompleteUpdate({ update_hashes: [] }, 0)).toBeUndefined();
	});
});
