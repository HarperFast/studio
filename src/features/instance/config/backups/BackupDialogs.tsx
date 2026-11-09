import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alertDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { backupsRemovedByPurge, DatabaseBackup } from '@/integrations/api/instance/backups/backups';
import { useId, useState } from 'react';

function CheckboxOption({ checked, onChange, label, detail }: {
	checked: boolean;
	onChange: (checked: boolean) => void;
	label: string;
	detail: string;
}) {
	const id = useId();
	return (
		<div className="flex items-start gap-3">
			<input
				id={id}
				type="checkbox"
				className="mt-1 size-4 shrink-0 accent-primary dark:accent-violet-300"
				checked={checked}
				aria-describedby={`${id}-detail`}
				onChange={(event) => onChange(event.target.checked)}
			/>
			<Label htmlFor={id} className="block font-normal leading-snug">
				<span className="block font-medium">{label}</span>
				<span id={`${id}-detail`} className="block text-sm text-muted-foreground">{detail}</span>
			</Label>
		</div>
	);
}

/** Rendered only while open, keyed by its target, so a choice made for one backup never carries to the next. */
export function TakeBackupDialog({ database, node, onCancel, onConfirm }: {
	database: string;
	node: string;
	onCancel: () => void;
	onConfirm: (options: { excludeBlobs: boolean }) => void;
}) {
	const [excludeBlobs, setExcludeBlobs] = useState(false);
	return (
		<AlertDialog open onOpenChange={(open) => !open && onCancel()}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Back up '{database}' on {node}?</AlertDialogTitle>
					<AlertDialogDescription>
						Harper writes the backup to this node's own disk, where it uses the node's storage. It copies only the files
						that changed since this node's last backup of '{database}'. The backup runs in the background, and this page
						follows it until it finishes.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<CheckboxOption
					checked={excludeBlobs}
					onChange={setExcludeBlobs}
					label="Leave out file attachments (blobs)"
					detail="The backup is smaller, but it can't bring back the database's file attachments."
				/>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<Button variant="submit" onClick={() => onConfirm({ excludeBlobs })}>Take backup</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

export function VerifyBackupDialog({ database, node, backupId, onCancel, onConfirm }: {
	database: string;
	node: string;
	backupId: number;
	onCancel: () => void;
	onConfirm: (options: { verifyChecksum: boolean }) => void;
}) {
	const [verifyChecksum, setVerifyChecksum] = useState(true);
	return (
		<AlertDialog open onOpenChange={(open) => !open && onCancel()}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Verify backup {backupId} of '{database}'?</AlertDialogTitle>
					<AlertDialogDescription>
						Harper checks that the backup on {node}{' '}
						can be read. The check runs in the background, and this page shows its result.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<CheckboxOption
					checked={verifyChecksum}
					onChange={setVerifyChecksum}
					label="Read every file and check its checksum"
					detail="Slower, and it reads the whole backup from the node's disk. Without it, Harper checks only that each file is there and the right size."
				/>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<Button variant="submit" onClick={() => onConfirm({ verifyChecksum })}>Verify</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

function parseKeepCount(text: string): number | undefined {
	const trimmed = text.trim();
	if (!/^\d+$/.test(trimmed)) {
		return undefined;
	}
	const value = Number(trimmed);
	return Number.isSafeInteger(value) && value >= 1 ? value : undefined;
}

function idList(ids: readonly number[]): string {
	if (ids.length > 6) {
		return `${ids.slice(0, 5).join(', ')} and ${ids.length - 5} more`;
	}
	return ids.length === 1 ? String(ids[0]) : `${ids.slice(0, -1).join(', ')} and ${ids.at(-1)}`;
}

function describePurge(backups: readonly DatabaseBackup[], keepCount: number): string {
	const removed = backupsRemovedByPurge(backups, keepCount);
	if (removed.length === 0) {
		return `Nothing to delete: there ${backups.length === 1 ? 'is only 1 backup' : `are only ${backups.length}`}.`;
	}
	const kept = backups.length - removed.length;
	const what = removed.length === 1 ? `backup ${removed[0]}` : `${removed.length} backups (${idList(removed)})`;
	return `Deletes ${what} and keeps the newest ${kept === 1 ? 'one' : kept}. This can't be undone.`;
}

export function PurgeBackupsDialog({ database, node, backups, onCancel, onConfirm }: {
	database: string;
	node: string;
	backups: readonly DatabaseBackup[];
	onCancel: () => void;
	onConfirm: (keepCount: number, expectedDeletions: number) => void;
}) {
	const inputId = useId();
	const [text, setText] = useState('');
	const keepCount = parseKeepCount(text);
	const removed = keepCount === undefined ? [] : backupsRemovedByPurge(backups, keepCount);
	return (
		<AlertDialog open onOpenChange={(open) => !open && onCancel()}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Keep only the newest backups of '{database}'</AlertDialogTitle>
					<AlertDialogDescription>
						There {backups.length === 1 ? 'is 1 backup' : `are ${backups.length} backups`} of '{database}' on{' '}
						{node}. Harper keeps the newest ones and deletes the rest, on this node only.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<div className="flex flex-col gap-2">
					<Label htmlFor={inputId}>Backups to keep</Label>
					<Input
						id={inputId}
						inputMode="numeric"
						className="w-32"
						autoFocus
						value={text}
						onChange={(event) => setText(event.target.value)}
					/>
					{text.trim() !== '' && keepCount === undefined && (
						<p className="text-sm text-destructive">Use a whole number of at least 1.</p>
					)}
					{keepCount !== undefined && <p className="text-sm" role="status">{describePurge(backups, keepCount)}</p>}
				</div>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<Button
						variant="destructive"
						disabled={keepCount === undefined || removed.length === 0}
						onClick={() => keepCount !== undefined && onConfirm(keepCount, removed.length)}
					>
						{removed.length === 0
							? 'Delete backups'
							: `Delete ${removed.length === 1 ? '1 backup' : `${removed.length} backups`}`}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
