import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { initialsOf } from '@/features/admin/apiToken/components/StaffUserCell';
import { UserActionsMenu } from '@/features/admin/users/components/UserActionsMenu';
import { AdminUser } from '@/features/admin/users/userAdminApi';
import { Timestamp } from '@/features/organization/serviceAccounts/components/Timestamp';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { cn } from '@/lib/cn';
import { CopyIcon, FingerprintIcon, MailIcon } from 'lucide-react';
import { ReactNode } from 'react';

type StatusStyle = { label: string; variant: 'success' | 'destructive' | 'secondary' | 'warning' };

const USER_STATUS: Record<string, StatusStyle> = {
	ACTIVE: { label: 'Active', variant: 'success' },
	DEACTIVATED: { label: 'Deactivated', variant: 'destructive' },
	DELETED: { label: 'Deleted', variant: 'secondary' },
	PENDING: { label: 'Pending', variant: 'warning' },
};

export function UserProfileCard({ user, onDeactivate }: { user: AdminUser; onDeactivate: () => void }) {
	const name = [user.firstname, user.lastname].filter(Boolean).join(' ') || user.email;
	const status = USER_STATUS[user.status ?? ''] ?? { label: user.status ?? 'Unknown', variant: 'secondary' };
	const [copyEmail, copyId] = useCopyToClipboard(user.email, user.id);
	const clusters = user.organizations.flatMap((membership) => membership.clusters);
	const adminOf = user.organizations.filter((membership) => membership.roleNames.includes('admin')).length;
	const running = clusters.filter((cluster) => cluster.status === 'RUNNING').length;

	return (
		<section className="overflow-hidden rounded-xl border bg-card">
			<div className="relative flex flex-col gap-4 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5 pr-14 sm:flex-row sm:items-center">
				<div className="absolute top-4 right-4">
					<UserActionsMenu user={user} onDeactivate={onDeactivate} />
				</div>
				<span
					aria-hidden
					className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/15 text-lg font-semibold text-primary dark:text-violet-200"
				>
					{initialsOf({ ...user, firstname: user.firstname ?? '', lastname: user.lastname ?? '' })}
				</span>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="truncate text-xl font-light">{name}</h2>
						<Badge variant={status.variant}>{status.label}</Badge>
					</div>
					<div className="mt-1.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
						<CopyableValue icon={<MailIcon />} copyLabel="Copy email" onCopy={copyEmail}>{user.email}</CopyableValue>
						<CopyableValue icon={<FingerprintIcon />} copyLabel="Copy user ID" onCopy={copyId} mono>
							{user.id}
						</CopyableValue>
					</div>
				</div>
			</div>
			<dl className="grid grid-cols-2 gap-px border-t bg-border lg:grid-cols-4">
				<Stat label="Organizations" value={user.organizations.length} detail={`Admin of ${adminOf}`} />
				<Stat label="Live clusters" value={clusters.length} detail={`${running} running`} />
				<Stat
					label="Last active"
					value={user.lastAccessedAt ? <Timestamp value={user.lastAccessedAt} format="relative" /> : 'Never'}
					detail={user.lastLoginDate
						? (
							<>
								Signed in <Timestamp value={user.lastLoginDate} format="date" />
							</>
						)
						: 'Never signed in'}
				/>
				<Stat
					label="Member since"
					value={user.createdAt ? <Timestamp value={user.createdAt} format="date" /> : '—'}
					detail={user.isVerified ? 'Email verified' : 'Email not verified'}
				/>
			</dl>
		</section>
	);
}

function CopyableValue({ icon, copyLabel, onCopy, mono, children }: {
	icon: ReactNode;
	copyLabel: string;
	onCopy: () => void;
	mono?: boolean;
	children: string;
}) {
	return (
		<span className="inline-flex min-w-0 items-center gap-1.5 [&>svg]:size-3.5 [&>svg]:shrink-0">
			{icon}
			<span className={cn('truncate', mono && 'font-mono text-xs')}>{children}</span>
			<Button type="button" variant="ghost" size="icon" className="size-6" aria-label={copyLabel} onClick={onCopy}>
				<CopyIcon className="size-3.5" />
			</Button>
		</span>
	);
}

function Stat({ label, value, detail }: { label: string; value: ReactNode; detail: ReactNode }) {
	return (
		<div className="bg-card px-5 py-4">
			<dt className="text-xs text-muted-foreground">{label}</dt>
			<dd className="mt-1 text-xl font-light tabular-nums sm:text-2xl">{value}</dd>
			<dd className="mt-0.5 text-xs text-muted-foreground">{detail}</dd>
		</div>
	);
}
