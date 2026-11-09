/**
 * Harper's managed database backups (harper `dataLayer/rocksdbBackup.ts`, epic harper#2100): checked,
 * incremental RocksDB backups kept on the node's own disk under `storage.backupPath`. Which node a
 * request reaches, and why: src/features/instance/config/backups/DESIGN.md.
 */
import { InstanceClientConfig, InstanceClientIdConfig } from '@/config/instanceClientConfig';
import { getJob, HarperJob } from '@/integrations/api/instance/database/getJob';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';
import { pollUnlessForbidden } from '@/react-query/pollUnlessForbidden';
import { queryOptions, useMutation } from '@tanstack/react-query';

/**
 * The first tagged Harper with the backup operations. No 5.2.0 prerelease carries them (the commit that adds
 * `rocksdbBackup.ts` landed after v5.2.0-beta.3), and their request and response shapes are unchanged from
 * v5.2.0 through 5.4.
 */
export const BACKUPS_MIN_VERSION = '5.2.0';

export function supportsBackups(version: string | undefined): boolean {
	return !!version && wasAReleasedBeforeB(BACKUPS_MIN_VERSION, version);
}

/** One complete backup, as `list_backups` reports it. Harper lists only backups whose creation finished. */
export interface DatabaseBackup {
	backupId: number;
	/** Seconds since the epoch: RocksDB's `BackupInfo.timestamp`. */
	timestamp?: number;
	/** Bytes of every database file the backup uses, files it shares with other backups included; no file attachments. */
	size?: number;
	fileCount?: number;
	/** Whether the backup holds a copy of the database's file attachments (blobs). */
	blobs?: boolean;
}

function finiteNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asBackup(row: unknown): DatabaseBackup[] {
	if (typeof row !== 'object' || row === null) {
		return [];
	}
	const { backup_id, timestamp, size, file_count, blobs } = row as Record<string, unknown>;
	// Every action names a backup by its id, so a row without a usable one can't be acted on or told apart.
	if (!Number.isSafeInteger(backup_id) || (backup_id as number) <= 0) {
		return [];
	}
	return [{
		backupId: backup_id as number,
		timestamp: finiteNumber(timestamp),
		size: finiteNumber(size),
		fileCount: finiteNumber(file_count),
		blobs: typeof blobs === 'boolean' ? blobs : undefined,
	}];
}

interface DatabaseArgs extends InstanceClientConfig {
	database: string;
}

/** Newest first. Ids only ever increase, so the id orders them even when a timestamp is missing. */
export async function listBackups({ instanceClient, database }: DatabaseArgs): Promise<DatabaseBackup[]> {
	const { data } = await instanceClient.post<unknown>('/', { operation: 'list_backups', database });
	return (Array.isArray(data) ? data.flatMap(asBackup) : []).sort((a, b) => b.backupId - a.backupId);
}

export function listBackupsQueryKey(entityId: string, database: string) {
	return [entityId, 'list_backups', database] as const;
}

export function listBackupsQueryOptions(
	{ entityId, instanceClient, database, enabled }: InstanceClientIdConfig & { database: string; enabled?: boolean },
) {
	return queryOptions({
		queryKey: listBackupsQueryKey(entityId, database),
		queryFn: () => listBackups({ instanceClient, database }),
		enabled,
		retry: false,
		// The page shows a refusal (an LMDB database, a node too old) beside the node it came from.
		meta: { reportsOwnFailure: true },
	});
}

/**
 * Harper accepted a create or verify but named no job, so Studio can't tell how it ends. An unknown outcome, not a
 * failure: the job may be running, and sending it again would only meet Harper's lock.
 */
export class BackupJobUnreportedError extends Error {
	constructor() {
		super(
			"Harper accepted the request but didn't say which job runs it, so Studio can't follow it. It may still be running: check the backups list before you try again.",
		);
		this.name = 'BackupJobUnreportedError';
	}
}

interface StartedJob {
	jobId: string;
}

async function startJob(instanceClient: InstanceClientConfig['instanceClient'], body: object): Promise<StartedJob> {
	const { data } = await instanceClient.post<{ job_id?: unknown; message?: unknown }>('/', body);
	if (typeof data?.job_id !== 'string' || !data.job_id) {
		throw new BackupJobUnreportedError();
	}
	return { jobId: data.job_id };
}

interface CreateBackupArgs extends DatabaseArgs {
	/** Leave the database's file attachments (blobs) out. Harper includes them unless told otherwise. */
	excludeBlobs?: boolean;
}

/** Harper runs it as a background job: the answer names the job, and {@link backupJobQueryOptions} follows it. */
export function createBackup({ instanceClient, database, excludeBlobs }: CreateBackupArgs) {
	return startJob(instanceClient, {
		operation: 'create_backup',
		database,
		...(excludeBlobs ? { exclude_blobs: true } : {}),
	});
}

export function useCreateBackup() {
	return useMutation({ mutationFn: createBackup });
}

interface VerifyBackupArgs extends DatabaseArgs {
	backupId: number;
	/** Read every file and compare its checksum, as a restore does, instead of checking only that each file is there. */
	verifyChecksum: boolean;
}

export function verifyBackup({ instanceClient, database, backupId, verifyChecksum }: VerifyBackupArgs) {
	return startJob(instanceClient, {
		operation: 'verify_backup',
		database,
		backup_id: backupId,
		verify_checksum: verifyChecksum,
	});
}

export function useVerifyBackup() {
	return useMutation({ mutationFn: verifyBackup });
}

interface DeleteBackupArgs extends DatabaseArgs {
	/** The backup as the confirmation showed it. */
	backup: DatabaseBackup;
}

export class BackupChangedError extends Error {
	constructor(backupId: number) {
		super(`Backup ${backupId} changed since the list was read, so nothing was deleted. Check the list and try again.`);
		this.name = 'BackupChangedError';
	}
}

/**
 * `delete_backup` names a backup by id alone, and Harper reuses ids once every backup is gone, so the id a confirmation
 * showed can name a newer backup by the time it is sent. Re-reading first refuses that; Harper takes no precondition, so
 * the window between the read and the delete stays open.
 */
export async function deleteBackup({ instanceClient, database, backup }: DeleteBackupArgs): Promise<void> {
	const current = (await listBackups({ instanceClient, database })).find(({ backupId }) =>
		backupId === backup.backupId
	);
	if (!current || current.timestamp !== backup.timestamp) {
		throw new BackupChangedError(backup.backupId);
	}
	await instanceClient.post('/', { operation: 'delete_backup', database, backup_id: backup.backupId });
}

export function useDeleteBackup() {
	return useMutation({ mutationFn: deleteBackup });
}

interface PurgeBackupsArgs extends DatabaseArgs {
	keepCount: number;
}

interface PurgeBackupsResult {
	deleted?: number;
	remaining?: number;
}

export async function purgeBackups(
	{ instanceClient, database, keepCount }: PurgeBackupsArgs,
): Promise<PurgeBackupsResult> {
	const { data } = await instanceClient.post<{ deleted?: unknown; remaining?: unknown }>('/', {
		operation: 'purge_backups',
		database,
		keep_count: keepCount,
	});
	return { deleted: finiteNumber(data?.deleted), remaining: finiteNumber(data?.remaining) };
}

export function usePurgeBackups() {
	return useMutation({ mutationFn: purgeBackups });
}

/** The `ids` a purge keeping `keepCount` removes from `backups`, oldest first: Harper keeps the newest by id. */
export function backupsRemovedByPurge(backups: readonly DatabaseBackup[], keepCount: number): number[] {
	return [...backups]
		.sort((a, b) => a.backupId - b.backupId)
		.slice(0, Math.max(0, backups.length - keepCount))
		.map((backup) => backup.backupId);
}

/** Lifecycle of a backup job: CREATED → IN_PROGRESS → COMPLETE | ERROR. */
type BackupJobStatus = 'running' | 'complete' | 'failed';

export function backupJobStatus(job: HarperJob | undefined): BackupJobStatus {
	switch (job?.status?.toUpperCase()) {
		case 'COMPLETE':
			return 'complete';
		case 'ERROR':
			return 'failed';
		default:
			return 'running';
	}
}

const JOB_POLL_MS = 1_500;

/**
 * Follows a backup job on the node that runs it. `hdb_job` does not replicate, so this must use the same
 * client that started the job; the node clients on the Backups page are pinned to one instance each.
 */
export function backupJobQueryOptions({ entityId, instanceClient, jobId }: InstanceClientIdConfig & { jobId: string }) {
	return queryOptions({
		queryKey: [entityId, 'get_job', jobId] as const,
		queryFn: async () => (await getJob({ jobId, instanceClient })) ?? null,
		refetchInterval: (query) =>
			query.state.data && backupJobStatus(query.state.data) !== 'running'
				? false
				: pollUnlessForbidden(JOB_POLL_MS)(query),
		// The job line shows a failed poll itself, beside the job it couldn't read.
		meta: { reportsOwnFailure: true },
	});
}

export function createdBackupId(job: HarperJob | null | undefined): number | undefined {
	const result = job?.result;
	if (typeof result !== 'object' || result === null) {
		return undefined;
	}
	const id = (result as { backup_id?: unknown }).backup_id;
	return Number.isSafeInteger(id) ? id as number : undefined;
}
