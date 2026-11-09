import { ConfirmDeletionModal } from '@/components/ConfirmDeletionModal';
import { Loading } from '@/components/Loading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InstanceClientIdConfig } from '@/config/instanceClientConfig';
import {
	PurgeBackupsDialog,
	TakeBackupDialog,
	VerifyBackupDialog,
} from '@/features/instance/config/backups/BackupDialogs';
import { BackupJobLine, BackupJobOutcome, FollowedBackupJob } from '@/features/instance/config/backups/BackupJobLine';
import {
	createdBackupId,
	DatabaseBackup,
	listBackupsQueryKey,
	listBackupsQueryOptions,
	useCreateBackup,
	useDeleteBackup,
	usePurgeBackups,
	useVerifyBackup,
} from '@/integrations/api/instance/backups/backups';
import { HarperJob } from '@/integrations/api/instance/database/getJob';
import { errorText } from '@/lib/errorText';
import { humanFileSize } from '@/lib/humanFileSize';
import { describeError } from '@/react-query/queryClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { toast } from 'sonner';

type BackupDialog =
	| { kind: 'take' }
	| { kind: 'purge' }
	| { kind: 'verify'; backup: DatabaseBackup }
	| { kind: 'delete'; backup: DatabaseBackup };

export function BackupNodeNotice({ children }: { children: ReactNode }) {
	return <p className="text-sm text-muted-foreground">{children}</p>;
}

export function BackupNodeCard({ label, detail, children }: { label: string; detail?: string; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-3 rounded-md border p-4" aria-label={`Backups on ${label}`}>
			<div className="flex min-w-0 flex-col">
				<h3 className="text-base font-semibold break-all">{label}</h3>
				{detail && detail !== label && (
					<span className="break-all font-mono text-xs text-muted-foreground">{detail}</span>
				)}
			</div>
			{children}
		</section>
	);
}

function formatTimestamp(seconds: number | undefined): string {
	return seconds === undefined ? '—' : new Date(seconds * 1000).toLocaleString();
}

function VerifyBadge({ job }: { job: FollowedBackupJob | undefined }) {
	if (!job) {
		return null;
	}
	if (job.outcome === 'complete') {
		return <Badge variant="success">Verified</Badge>;
	}
	if (job.outcome === 'failed') {
		return <Badge variant="destructive">Failed verification</Badge>;
	}
	if (job.outcome === undefined) {
		return <Badge variant="outline">Verifying</Badge>;
	}
	return null;
}

/**
 * The backups of one database on one node, and every action on them. `nodeParams` must be pinned to that node:
 * what it lists, takes and deletes is only ever on its own disk, and its jobs are only in its own `hdb_job`.
 */
export function BackupNodeSection({ nodeParams, label, name = label, database }: {
	nodeParams: InstanceClientIdConfig;
	label: string;
	/** The node as named mid-sentence, when that differs from its heading ("this instance"). */
	name?: string;
	database: string;
}) {
	const queryClient = useQueryClient();
	const { data: backups, error, isPending } = useQuery(listBackupsQueryOptions({ ...nodeParams, database }));
	const [jobs, setJobs] = useState<FollowedBackupJob[]>([]);
	const [dialog, setDialog] = useState<BackupDialog>();
	const { mutate: createBackup, isPending: isCreating } = useCreateBackup();
	const { mutate: verifyBackup, isPending: isStartingVerify } = useVerifyBackup();
	const { mutate: deleteBackup, isPending: isDeleting } = useDeleteBackup();
	const { mutate: purgeBackups, isPending: isPurging } = usePurgeBackups();

	const refreshList = (forDatabase: string) =>
		void queryClient.invalidateQueries({ queryKey: listBackupsQueryKey(nodeParams.entityId, forDatabase) });

	const follow = (job: Omit<FollowedBackupJob, 'startedAt'>) =>
		setJobs((current) => [{ ...job, startedAt: Date.now() }, ...current]);

	const onJobSettled = (job: FollowedBackupJob, outcome: BackupJobOutcome, record: HarperJob | null | undefined) => {
		setJobs((current) =>
			current.map((candidate) => candidate.jobId === job.jobId ? { ...candidate, outcome } : candidate)
		);
		if (job.kind === 'create') {
			refreshList(job.database);
		}
		if (outcome === 'complete') {
			const backupId = createdBackupId(record);
			toast.success(
				job.kind === 'create'
					? `Backed up '${job.database}' on ${name}${backupId === undefined ? '' : ` as backup ${backupId}`}`
					: `Backup ${job.backupId} of '${job.database}' on ${name} verified`,
			);
		} else if (outcome === 'failed') {
			const reason = errorText(record?.message);
			toast.error(
				job.kind === 'create'
					? `Backing up '${job.database}' on ${name} failed`
					: `Backup ${job.backupId} of '${job.database}' on ${name} failed verification`,
				reason ? { description: reason } : undefined,
			);
		}
	};

	// Harper takes one write at a time per database's backups, and refuses the rest with a 409. Holding the
	// buttons while one of this page's jobs runs says why before the request goes out.
	const runningJobs = jobs.filter((job) => job.database === database && job.outcome === undefined);
	const writeBusy = runningJobs.length > 0 || isCreating || isStartingVerify || isDeleting || isPurging;
	const busyReason = runningJobs.length > 0
		? 'Wait for the backup or verify job running on this node to finish.'
		: writeBusy
		? 'Wait for the request in progress on this node to finish.'
		: undefined;
	// Matched on the timestamp too: Harper starts the ids over once every backup is deleted, and a result for the
	// old backup 1 must not land on the new one.
	const latestVerify = (backup: DatabaseBackup) =>
		jobs.find((job) =>
			job.kind === 'verify' && job.database === database && job.backupId === backup.backupId
			&& backup.timestamp !== undefined && job.backupTimestamp === backup.timestamp
		);

	const close = () => setDialog(undefined);

	const onTake = (excludeBlobs: boolean) => {
		close();
		createBackup({ ...nodeParams, database, excludeBlobs }, {
			onSuccess: ({ jobId }) => follow({ jobId, database, kind: 'create' }),
			// The global toast shows Harper's refusal. A refusal can come from a list that went stale (a database
			// that was dropped), so read it again.
			onError: () => refreshList(database),
		});
	};

	const onVerify = ({ backupId, timestamp: backupTimestamp }: DatabaseBackup, verifyChecksum: boolean) => {
		close();
		verifyBackup({ ...nodeParams, database, backupId, verifyChecksum }, {
			onSuccess: ({ jobId }) => follow({ jobId, database, kind: 'verify', backupId, backupTimestamp, verifyChecksum }),
			// "Backup N not found" means the row is stale: deleted from another tab, or by another administrator.
			onError: () => refreshList(database),
		});
	};

	const onDelete = (backup: DatabaseBackup) => {
		deleteBackup({ ...nodeParams, database, backup }, {
			onSuccess: () => toast.success(`Deleted backup ${backup.backupId} of '${database}' from ${name}`),
			onSettled: () => {
				close();
				refreshList(database);
			},
		});
	};

	const onPurge = (keepCount: number, expectedDeletions: number) => {
		close();
		purgeBackups({ ...nodeParams, database, keepCount }, {
			onSuccess: ({ deleted }) => {
				if (deleted === undefined) {
					toast.success(`Kept the newest ${keepCount} of '${database}' on ${name}`, {
						description: "Harper didn't say how many it deleted. The list shows what's left.",
					});
					return;
				}
				const description = deleted !== expectedDeletions
					? `Harper deleted ${deleted}, not the ${expectedDeletions} this page expected: the node's backups changed since the list was read.`
					: undefined;
				toast.success(
					`Deleted ${deleted === 1 ? '1 backup' : `${deleted} backups`} of '${database}' from ${name}`,
					description ? { description } : undefined,
				);
			},
			onSettled: () => refreshList(database),
		});
	};

	return (
		<>
			<div className="flex flex-wrap gap-2">
				<Button
					size="sm"
					variant="submit"
					disabled={writeBusy}
					title={busyReason}
					onClick={() => setDialog({ kind: 'take' })}
				>
					Take backup
				</Button>
				<Button
					size="sm"
					variant="destructiveOutline"
					disabled={writeBusy || !backups?.length}
					title={busyReason}
					onClick={() => setDialog({ kind: 'purge' })}
				>
					Keep newest…
				</Button>
			</div>

			{jobs.length > 0 && (
				<ul className="flex flex-col gap-1" aria-label={`Backup jobs on ${label}`}>
					{jobs.map((job) => (
						<BackupJobLine
							key={job.jobId}
							job={job}
							nodeParams={nodeParams}
							onSettled={(outcome, record) => onJobSettled(job, outcome, record)}
							onDismiss={() => setJobs((current) => current.filter((candidate) => candidate.jobId !== job.jobId))}
						/>
					))}
				</ul>
			)}

			{error
				? (
					<p className="text-sm text-destructive" role="alert">
						Couldn't list the backups of '{database}' on this node: {describeError(error).message}
					</p>
				)
				: isPending
				? <Loading text="Loading..." />
				: !backups?.length
				? <BackupNodeNotice>No backups of '{database}' on this node yet.</BackupNodeNotice>
				: (
					<BackupTable
						backups={backups}
						verifyFor={latestVerify}
						writeBusy={writeBusy}
						busyReason={busyReason}
						onVerify={(backup) => setDialog({ kind: 'verify', backup })}
						onDelete={(backup) => setDialog({ kind: 'delete', backup })}
					/>
				)}

			{dialog?.kind === 'take' && (
				<TakeBackupDialog
					database={database}
					node={name}
					onCancel={close}
					onConfirm={({ excludeBlobs }) => onTake(excludeBlobs)}
				/>
			)}
			{dialog?.kind === 'verify' && (
				<VerifyBackupDialog
					key={dialog.backup.backupId}
					database={database}
					node={name}
					backupId={dialog.backup.backupId}
					onCancel={close}
					onConfirm={({ verifyChecksum }) => onVerify(dialog.backup, verifyChecksum)}
				/>
			)}
			{dialog?.kind === 'purge' && backups && (
				<PurgeBackupsDialog
					database={database}
					node={name}
					backups={backups}
					onCancel={close}
					onConfirm={onPurge}
				/>
			)}
			<ConfirmDeletionModal
				typeOfThingBeingDeleted="backup"
				nameOfThingBeingDeleted={dialog?.kind === 'delete'
					? `${dialog.backup.backupId} of '${database}' on ${name}`
					: ''}
				isModalOpen={dialog?.kind === 'delete'}
				setIsModalOpen={(open) => !open && !isDeleting && close()}
				deletionConfirmed={() => dialog?.kind === 'delete' && onDelete(dialog.backup)}
				deletionPending={isDeleting}
			/>
		</>
	);
}

function BackupTable({ backups, verifyFor, writeBusy, busyReason, onVerify, onDelete }: {
	backups: readonly DatabaseBackup[];
	verifyFor: (backup: DatabaseBackup) => FollowedBackupJob | undefined;
	writeBusy: boolean;
	busyReason?: string;
	onVerify: (backup: DatabaseBackup) => void;
	onDelete: (backup: DatabaseBackup) => void;
}) {
	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Backup</TableHead>
					<TableHead>Taken</TableHead>
					<TableHead title="Every database file the backup uses, including files it shares with other backups. File attachments aren't counted.">
						Size
					</TableHead>
					<TableHead>File attachments</TableHead>
					<TableHead />
				</TableRow>
			</TableHeader>
			<TableBody>
				{backups.map((backup) => {
					const verify = verifyFor(backup);
					return (
						<TableRow key={backup.backupId} aria-label={`Backup ${backup.backupId}`}>
							<TableCell className="font-mono">
								<span className="flex flex-wrap items-center gap-2">
									{backup.backupId}
									<VerifyBadge job={verify} />
								</span>
							</TableCell>
							<TableCell>{formatTimestamp(backup.timestamp)}</TableCell>
							<TableCell title={backup.size === undefined ? undefined : `${backup.size.toLocaleString()} bytes`}>
								{backup.size === undefined ? '—' : humanFileSize(backup.size)}
							</TableCell>
							<TableCell>{backup.blobs === undefined ? '—' : backup.blobs ? 'Included' : 'Left out'}</TableCell>
							<TableCell>
								<span className="flex justify-end gap-2">
									<Button
										size="sm"
										variant="defaultOutline"
										disabled={writeBusy}
										title={busyReason}
										onClick={() => onVerify(backup)}
									>
										Verify
									</Button>
									<Button
										size="sm"
										variant="destructiveOutline"
										disabled={writeBusy}
										title={busyReason}
										onClick={() => onDelete(backup)}
									>
										Delete
									</Button>
								</span>
							</TableCell>
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}
