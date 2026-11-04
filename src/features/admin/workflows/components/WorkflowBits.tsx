import { Badge } from '@/components/ui/badge';
import { isLastingFailure, type WorkflowRow, type WorkflowStatus } from '@/features/admin/workflows/workflowAdminApi';
import { pauseLabel } from '@/features/admin/workflows/workflowProgress';
import { ReactNode, useState } from 'react';

const STATUS_BADGE: Record<WorkflowStatus, 'success' | 'warning' | 'secondary' | 'outline' | 'destructive'> = {
	PENDING: 'secondary',
	RUNNING: 'secondary',
	UNDOING: 'warning',
	PAUSED: 'warning',
	SUCCEEDED: 'success',
	UNDONE: 'outline',
	ABANDONED: 'outline',
};

export function WorkflowStatusBadge({ row }: { row: Pick<WorkflowRow, 'status' | 'pause'> }) {
	const paused = row.status === 'PAUSED';
	const variant = paused && row.pause?.reason !== 'command' ? 'destructive' : STATUS_BADGE[row.status] ?? 'outline';
	const pause = paused ? pauseLabel(row.pause?.reason) : null;
	return (
		<span className="flex flex-wrap items-center gap-1">
			<Badge variant={variant}>{row.status}</Badge>
			{pause && <span className="text-xs text-muted-foreground">{pause}</span>}
		</span>
	);
}

export function Timestamp({ value }: { value?: string | null }) {
	if (!value) { return <span className="text-muted-foreground">—</span>; }
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) { return <span>{value}</span>; }
	return <time dateTime={value} title={value}>{date.toLocaleString()}</time>;
}

export function JsonBlock({ value, label }: { value: unknown; label?: string }) {
	if (value === undefined || value === null) { return null; }
	const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
	return (
		<pre
			aria-label={label}
			className="max-h-80 overflow-auto rounded-md border bg-muted/40 p-2 text-xs leading-relaxed whitespace-pre-wrap break-words"
		>
			{text}
		</pre>
	);
}

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="grid grid-cols-[10rem_1fr] gap-3 text-sm">
			<dt className="text-muted-foreground">{label}</dt>
			<dd className="min-w-0 break-words">{children}</dd>
		</div>
	);
}

export function RefreshFailed({ error }: { error: unknown }) {
	return (
		<p className="mb-4 text-sm text-destructive">
			Couldn't refresh from central manager; showing what was last read.{isLastingFailure(error) ? '' : ' Retrying.'}
		</p>
	);
}

/** The JSON is built only once opened: receipts and event data can be large, and the detail page re-renders on every poll. */
export function Collapsible({ summary, value }: { summary: string; value: unknown }) {
	const [open, setOpen] = useState(false);
	if (value === undefined || value === null) { return null; }
	return (
		<details onToggle={(event) => setOpen(event.currentTarget.open)}>
			<summary className="cursor-pointer text-xs text-muted-foreground">{summary}</summary>
			{open && <JsonBlock value={value} label={summary} />}
		</details>
	);
}
