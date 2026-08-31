import { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { updateTableRecords } from './updateTableRecords';

function client(data: unknown) {
	return { post: vi.fn().mockResolvedValue({ data }) } as unknown as AxiosInstance;
}

const one = [{ id: 'abc-123', name: 'Ada' }];

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

	// Harper answers 200 with the record named in `skipped_hashes` when nothing is stored under its
	// key. Reporting that as success is #1643 by another route.
	it('rejects a response that skipped a record', async () => {
		const instanceClient = client({ update_hashes: [], skipped_hashes: ['abc-123'] });

		await expect(updateTableRecords({ databaseName: 'data', tableName: 'dog', records: one, instanceClient }))
			.rejects.toThrow(/updated 0 of 1 records and skipped 1/);
	});

	it('rejects a response that wrote fewer records than were sent', async () => {
		const instanceClient = client({ update_hashes: ['abc-123'] });
		const two = [...one, { id: 'def-456', name: 'Grace' }];

		await expect(updateTableRecords({ databaseName: 'data', tableName: 'dog', records: two, instanceClient }))
			.rejects.toThrow(/updated 1 of 2 records/);
	});

	it('accepts a response that wrote every record', async () => {
		const instanceClient = client({ update_hashes: ['abc-123'], skipped_hashes: [] });

		await expect(updateTableRecords({ databaseName: 'data', tableName: 'dog', records: one, instanceClient }))
			.resolves.toEqual({ update_hashes: ['abc-123'], skipped_hashes: [] });
	});

	// A field that is present but unreadable is not the legacy case below: the responder does answer
	// this operation, so its unreadable answer can't be taken as success.
	it('rejects a response whose update_hashes is present but not an array', async () => {
		const instanceClient = client({ update_hashes: 'abc-123' });

		await expect(updateTableRecords({ databaseName: 'data', tableName: 'dog', records: one, instanceClient }))
			.rejects.toThrow(/didn't report which records it wrote/);
	});

	it('rejects a response whose skipped_hashes is present but not an array', async () => {
		const instanceClient = client({ update_hashes: ['abc-123'], skipped_hashes: 'nope' });

		await expect(updateTableRecords({ databaseName: 'data', tableName: 'dog', records: one, instanceClient }))
			.rejects.toThrow(/didn't report which records it wrote/);
	});

	// Fails open, unlike the `put` check: `update` runs against every version Studio manages, back to
	// 4.7, so an absent key can't be read as a bad response.
	it('accepts a response that reports no hashes at all', async () => {
		const instanceClient = client({ message: 'updated 1 of 1 records' });

		await expect(updateTableRecords({ databaseName: 'data', tableName: 'dog', records: one, instanceClient }))
			.resolves.toEqual({ message: 'updated 1 of 1 records' });
	});
});
