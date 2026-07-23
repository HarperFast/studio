import { DataTable } from '@/components/DataTable';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alertDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
	NotificationDraft,
	useCreateNotificationMutation,
	useDeleteNotificationMutation,
	useUpdateNotificationMutation,
} from '@/features/admin/notifications/mutations/useNotificationMutations';
import { NotificationLink } from '@/features/notifications/components/NotificationLink';
import { useNotifications } from '@/features/notifications/hooks';
import { getSeverityConfig, toMs } from '@/features/notifications/notificationHelpers';
import { SystemStatusNotification } from '@/integrations/api/api.patch';
import { ColumnDef } from '@tanstack/react-table';
import { PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

const TYPE_OPTIONS = [
	{ value: 'error', label: 'Error / Outage' },
	{ value: 'warning', label: 'Warning' },
	{ value: 'maintenance', label: 'Maintenance' },
	{ value: 'info', label: 'Info' },
];

/** A stored timestamp → the `YYYY-MM-DDTHH:mm` local value a `datetime-local` input expects. */
function toInputValue(value: string | number | null | undefined): string {
	const ms = toMs(value);
	if (ms === null) { return ''; }
	const date = new Date(ms);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${
		pad(date.getMinutes())
	}`;
}

/** A `datetime-local` value (local time) → a UTC ISO string, or null when empty. */
function fromInputValue(value: string): string | null {
	if (!value) { return null; }
	const ms = Date.parse(value);
	return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

function formatWindow(notification: SystemStatusNotification): string {
	const start = toMs(notification.startAt);
	const end = toMs(notification.endAt);
	if (start === null && end === null) { return 'Always'; }
	const fmt = (ms: number | null) => (ms === null ? '—' : new Date(ms).toLocaleString());
	return `${fmt(start)} → ${fmt(end)}`;
}

export function NotificationsAdminIndex() {
	const { data, isLoading } = useNotifications();
	const [formOpen, setFormOpen] = useState(false);
	const [editing, setEditing] = useState<SystemStatusNotification | null>(null);
	const [deleteTarget, setDeleteTarget] = useState<SystemStatusNotification | null>(null);
	const deleteMutation = useDeleteNotificationMutation();

	const openCreate = useCallback(() => {
		setEditing(null);
		setFormOpen(true);
	}, []);
	const openEdit = useCallback((notification: SystemStatusNotification) => {
		setEditing(notification);
		setFormOpen(true);
	}, []);

	const columns = useMemo<ColumnDef<SystemStatusNotification>[]>(
		() => buildColumns({ openEdit, onDelete: setDeleteTarget }),
		[openEdit],
	);

	return (
		<div className="max-w-5xl">
			<div className="flex items-start justify-between gap-4">
				<div>
					<h1 className="text-2xl font-light">Notifications</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						System-wide notices shown to all users in the notification center. Times are stored in UTC.
					</p>
				</div>
				<Button variant="submit" onClick={openCreate} className="shrink-0">
					<PlusIcon />
					New notification
				</Button>
			</div>

			<div className="mt-6">
				{isLoading ? <Skeleton className="h-40 w-full" /> : <DataTable columns={columns} data={data ?? []} />}
			</div>

			<NotificationFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} />

			<AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete notification?</AlertDialogTitle>
						<AlertDialogDescription>
							This removes it for everyone immediately. This can't be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							disabled={deleteMutation.isPending}
							onClick={(event) => {
								event.preventDefault();
								if (!deleteTarget) { return; }
								deleteMutation.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
							}}
						>
							{deleteMutation.isPending ? 'Deleting…' : 'Delete'}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function buildColumns(
	{ openEdit, onDelete }: {
		openEdit: (notification: SystemStatusNotification) => void;
		onDelete: (notification: SystemStatusNotification) => void;
	},
): ColumnDef<SystemStatusNotification>[] {
	return [
		{
			header: 'Type',
			accessorKey: 'type',
			size: 12,
			cell: ({ row }) => {
				const { label, badgeVariant } = getSeverityConfig(row.original.type);
				return <Badge variant={badgeVariant}>{row.original.type || label}</Badge>;
			},
		},
		{
			header: 'Message',
			accessorKey: 'message',
			size: 40,
			cell: ({ row }) => <span className="line-clamp-2 break-words">{row.original.message}</span>,
		},
		{
			header: 'Active window (local)',
			size: 28,
			cell: ({ row }) => <span className="text-sm text-muted-foreground">{formatWindow(row.original)}</span>,
		},
		{
			header: 'Link',
			size: 8,
			cell: ({ row }) =>
				row.original.url
					? <NotificationLink url={row.original.url} className="text-sm text-primary hover:underline dark:text-white" />
					: <span className="text-muted-foreground">—</span>,
		},
		{
			header: '',
			id: 'actions',
			size: 12,
			cell: ({ row }) => (
				<div className="flex justify-end gap-1">
					<Button variant="ghost" size="icon" aria-label="Edit" onClick={() => openEdit(row.original)}>
						<PencilIcon />
					</Button>
					<Button
						variant="destructiveGhost"
						size="icon"
						aria-label="Delete"
						onClick={() => onDelete(row.original)}
					>
						<Trash2Icon />
					</Button>
				</div>
			),
		},
	];
}

function NotificationFormDialog({
	open,
	onOpenChange,
	editing,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	editing: SystemStatusNotification | null;
}) {
	const createMutation = useCreateNotificationMutation();
	const updateMutation = useUpdateNotificationMutation();
	const isPending = createMutation.isPending || updateMutation.isPending;

	const [type, setType] = useState('error');
	const [message, setMessage] = useState('');
	const [url, setUrl] = useState('');
	const [startAt, setStartAt] = useState('');
	const [endAt, setEndAt] = useState('');
	const [error, setError] = useState<string | null>(null);

	// Reset the form to the edited row (or blanks for create) each time the dialog opens.
	useEffect(() => {
		if (!open) { return; }
		setType(editing?.type ?? 'error');
		setMessage(editing?.message ?? '');
		setUrl(editing?.url ?? '');
		setStartAt(toInputValue(editing?.startAt));
		setEndAt(toInputValue(editing?.endAt));
		setError(null);
	}, [open, editing]);

	const submit = () => {
		const trimmedMessage = message.trim();
		if (!trimmedMessage) {
			setError('Message is required.');
			return;
		}
		const start = fromInputValue(startAt);
		const end = fromInputValue(endAt);
		if (start && end && Date.parse(end) <= Date.parse(start)) {
			setError('End time must be after start time.');
			return;
		}

		const draft: NotificationDraft = {
			type,
			message: trimmedMessage,
			url: url.trim() || null,
			startAt: start,
			endAt: end,
		};
		const onSuccess = () => onOpenChange(false);
		if (editing) {
			updateMutation.mutate({ id: editing.id, draft }, { onSuccess });
		} else {
			createMutation.mutate(draft, { onSuccess });
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{editing ? 'Edit notification' : 'New notification'}</DialogTitle>
					<DialogDescription>
						Shown to all users. Leave start/end empty for an open-ended window.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<div className="flex flex-col gap-2">
						<Label htmlFor="notification-type">Type</Label>
						<Select value={type} onValueChange={setType}>
							<SelectTrigger id="notification-type" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{TYPE_OPTIONS.map((option) => (
									<SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="notification-message">Message</Label>
						<Textarea
							id="notification-message"
							rows={3}
							value={message}
							onChange={(event) => setMessage(event.target.value)}
							placeholder="The Fabric control plane will be undergoing maintenance…"
						/>
					</div>

					<div className="flex flex-col gap-2">
						<Label htmlFor="notification-url">Link (optional)</Label>
						<Input
							id="notification-url"
							value={url}
							onChange={(event) => setUrl(event.target.value)}
							placeholder="https://status.harper.io  or  /organizations"
						/>
						<p className="text-xs text-muted-foreground">
							An absolute URL opens in a new tab; a path like <code>/organizations</code> links inside Studio.
						</p>
					</div>

					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-2">
							<Label htmlFor="notification-start">Start (local time)</Label>
							<Input
								id="notification-start"
								type="datetime-local"
								value={startAt}
								onChange={(event) => setStartAt(event.target.value)}
							/>
						</div>
						<div className="flex flex-col gap-2">
							<Label htmlFor="notification-end">End (local time)</Label>
							<Input
								id="notification-end"
								type="datetime-local"
								value={endAt}
								onChange={(event) => setEndAt(event.target.value)}
							/>
						</div>
					</div>

					{error && <p className="text-sm text-destructive">{error}</p>}
				</div>

				<DialogFooter>
					<Button variant="ghostOutline" onClick={() => onOpenChange(false)} disabled={isPending}>
						Cancel
					</Button>
					<Button variant="submit" onClick={submit} disabled={isPending}>
						{isPending ? 'Saving…' : editing ? 'Save changes' : 'Create'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
