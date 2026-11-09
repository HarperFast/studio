import { OUTCOME_UNKNOWN_TITLE } from '@/integrations/api/unansweredWrite';
import { describeError } from '@/react-query/queryClient';
import type { AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import {
	BackupChangedError,
	backupJobStatus,
	BackupJobUnreportedError,
	backupsRemovedByPurge,
	createBackup,
	createdBackupId,
	DatabaseBackup,
	deleteBackup,
	listBackups,
	purgeBackups,
	supportsBackups,
	verifyBackup,
} from './backups';

function client(answer: unknown) {
	const post = vi.fn(async () => ({ data: answer }));
	return { instanceClient: { post } as unknown as AxiosInstance, post };
}

describe('supportsBackups', () => {
	it('starts at 5.2.0, which no 5.2.0 prerelease reached', () => {
		expect(supportsBackups('5.2.0')).toBe(true);
		expect(supportsBackups('5.4.0-beta.2')).toBe(true);
		expect(supportsBackups('5.2.0-beta.3')).toBe(false);
		expect(supportsBackups('5.1.9')).toBe(false);
		expect(supportsBackups(undefined)).toBe(false);
	});
});

describe('listBackups', () => {
	it('names the database and reads the rows newest first', async () => {
		const { instanceClient, post } = client([
			{ backup_id: 1, timestamp: 1_700_000_000, size: 2048, file_count: 9, blobs: true },
			{ backup_id: 3, timestamp: 1_700_000_200, size: 4096, file_count: 12, blobs: false },
		]);
		const backups = await listBackups({ instanceClient, database: 'data' });
		expect(post).toHaveBeenCalledWith('/', { operation: 'list_backups', database: 'data' });
		expect(backups).toEqual([
			{ backupId: 3, timestamp: 1_700_000_200, size: 4096, fileCount: 12, blobs: false },
			{ backupId: 1, timestamp: 1_700_000_000, size: 2048, fileCount: 9, blobs: true },
		]);
	});

	it('drops a row no action could name, and leaves out fields it cannot read', async () => {
		const { instanceClient } = client([
			{ backup_id: '2' },
			{ backup_id: 0 },
			null,
			{ backup_id: 4, timestamp: 'yesterday', blobs: 'yes' },
		]);
		expect(await listBackups({ instanceClient, database: 'data' })).toEqual([
			{ backupId: 4, timestamp: undefined, size: undefined, fileCount: undefined, blobs: undefined },
		]);
	});

	it('reads an answer that is not a list as no backups', async () => {
		const { instanceClient } = client({ message: 'odd' });
		expect(await listBackups({ instanceClient, database: 'data' })).toEqual([]);
	});
});

describe('the job operations', () => {
	it('takes a backup with blobs unless told to leave them out', async () => {
		const { instanceClient, post } = client({ message: 'Starting job with id j-1', job_id: 'j-1' });
		expect(await createBackup({ instanceClient, database: 'data' })).toEqual({ jobId: 'j-1' });
		expect(post).toHaveBeenLastCalledWith('/', { operation: 'create_backup', database: 'data' });
		await createBackup({ instanceClient, database: 'data', excludeBlobs: true });
		expect(post).toHaveBeenLastCalledWith('/', { operation: 'create_backup', database: 'data', exclude_blobs: true });
	});

	it('verifies one backup, saying whether to compare checksums', async () => {
		const { instanceClient, post } = client({ job_id: 'j-2' });
		await verifyBackup({ instanceClient, database: 'data', backupId: 7, verifyChecksum: false });
		expect(post).toHaveBeenCalledWith('/', {
			operation: 'verify_backup',
			database: 'data',
			backup_id: 7,
			verify_checksum: false,
		});
	});

	it('reads an accepted request that names no job as an unknown outcome, not a failure', async () => {
		const { instanceClient } = client({ message: 'ok' });
		const error = await createBackup({ instanceClient, database: 'data' }).catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(BackupJobUnreportedError);
		expect(describeError(error)).toMatchObject({ title: OUTCOME_UNKNOWN_TITLE });
	});
});

describe('deleteBackup and purgeBackups', () => {
	function listingThen(rows: unknown[]) {
		const post = vi.fn(async (_url: string, body: { operation: string }) => ({
			data: body.operation === 'list_backups' ? rows : { ok: true },
		}));
		return { instanceClient: { post } as unknown as AxiosInstance, post };
	}

	it('deletes the backup the confirmation showed', async () => {
		const { instanceClient, post } = listingThen([{ backup_id: 5, timestamp: 100 }]);
		await deleteBackup({ instanceClient, database: 'data', backup: { backupId: 5, timestamp: 100 } });
		expect(post).toHaveBeenLastCalledWith('/', { operation: 'delete_backup', database: 'data', backup_id: 5 });
	});

	it('deletes nothing once the id names a newer backup, or none', async () => {
		for (const rows of [[{ backup_id: 5, timestamp: 900 }], [], [{ backup_id: 5 }]]) {
			const { instanceClient, post } = listingThen(rows);
			await expect(
				deleteBackup({ instanceClient, database: 'data', backup: { backupId: 5, timestamp: 100 } }),
			).rejects.toBeInstanceOf(BackupChangedError);
			expect(post.mock.calls.map((call) => call[1].operation)).toEqual(['list_backups']);
		}
	});

	it('deletes nothing when neither side has a timestamp to tell two backups apart', async () => {
		const { instanceClient, post } = listingThen([{ backup_id: 5 }]);
		await expect(deleteBackup({ instanceClient, database: 'data', backup: { backupId: 5 } })).rejects.toBeInstanceOf(
			BackupChangedError,
		);
		expect(post.mock.calls.map((call) => call[1].operation)).toEqual(['list_backups']);
	});

	it("reports the purge's own counts", async () => {
		const { instanceClient, post } = client({ deleted: 2, remaining: 3 });
		expect(await purgeBackups({ instanceClient, database: 'data', keepCount: 3 })).toEqual({
			deleted: 2,
			remaining: 3,
		});
		expect(post).toHaveBeenCalledWith('/', { operation: 'purge_backups', database: 'data', keep_count: 3 });
	});

	it('leaves a count it could not read undefined rather than guessing', async () => {
		const { instanceClient } = client({ ok: true });
		expect(await purgeBackups({ instanceClient, database: 'data', keepCount: 1 })).toEqual({
			deleted: undefined,
			remaining: undefined,
		});
	});
});

describe('backupsRemovedByPurge', () => {
	const backups: DatabaseBackup[] = [5, 2, 9, 7].map((backupId) => ({ backupId }));

	it('removes the oldest ids, whatever order the list is in, as Harper keeps the newest by id', () => {
		expect(backupsRemovedByPurge(backups, 2)).toEqual([2, 5]);
		expect(backupsRemovedByPurge(backups, 1)).toEqual([2, 5, 7]);
	});

	it('removes nothing when there are no more than it keeps', () => {
		expect(backupsRemovedByPurge(backups, 4)).toEqual([]);
		expect(backupsRemovedByPurge(backups, 10)).toEqual([]);
	});
});

describe('reading a job', () => {
	it('treats only COMPLETE and ERROR as ended', () => {
		expect(backupJobStatus({ id: 'j', status: 'COMPLETE' })).toBe('complete');
		expect(backupJobStatus({ id: 'j', status: 'ERROR' })).toBe('failed');
		expect(backupJobStatus({ id: 'j', status: 'CREATED' })).toBe('running');
		expect(backupJobStatus({ id: 'j', status: 'IN_PROGRESS' })).toBe('running');
		expect(backupJobStatus(undefined)).toBe('running');
	});

	it("reads the new backup's id from the job's result", () => {
		expect(createdBackupId({ id: 'j', status: 'COMPLETE', result: { database: 'data', backup_id: 8 } })).toBe(8);
		expect(createdBackupId({ id: 'j', status: 'COMPLETE', message: 'Successfully completed job: j' })).toBeUndefined();
		expect(createdBackupId(null)).toBeUndefined();
	});
});
