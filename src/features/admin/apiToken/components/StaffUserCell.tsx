import { getStaffUserQueryOptions, StaffUserSummary } from '@/features/admin/apiToken/queries/staffUsers';
import { cn } from '@/lib/cn';
import { useQuery } from '@tanstack/react-query';
import { ReactNode } from 'react';

export function initialsOf(user: StaffUserSummary): string {
	const fromName = [user.firstname, user.lastname].map((part) => part?.trim()[0] ?? '').join('');
	return (fromName || user.email[0] || '?').toUpperCase();
}

/**
 * A user as the console shows one: an initial, the name, and a second line that is the address
 * by default or whatever the caller puts there. Every staff role holds user:read, so the lookup
 * works for whoever can see the list; until it answers, or if it never does, the id stands in.
 */
export function StaffUserCell({
	userId,
	self,
	detail,
	muted,
}: {
	userId: string;
	self: StaffUserSummary;
	/** Replaces the address on the second line (the Created column shows the date there). */
	detail?: ReactNode;
	muted?: boolean;
}) {
	const isSelf = userId === self.id;
	const { data } = useQuery({ ...getStaffUserQueryOptions(userId), enabled: !isSelf });
	const user = isSelf ? self : data;
	const name = user ? [user.firstname, user.lastname].filter(Boolean).join(' ') || user.email : userId;
	return (
		<div className="flex items-center gap-2.5">
			<span
				className={cn(
					'flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
					muted ? 'bg-muted text-muted-foreground' : 'bg-primary/15 text-primary dark:text-violet-200',
				)}
				aria-hidden
			>
				{user ? initialsOf(user) : '?'}
			</span>
			<div className="flex min-w-0 flex-col leading-tight">
				<span className={cn('[overflow-wrap:anywhere]', !user && 'font-mono text-xs')} title={userId}>
					{name}
					{isSelf && <span className="text-muted-foreground">{' '}(you)</span>}
				</span>
				<span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
					{detail ?? (user ? user.email : '')}
				</span>
			</div>
		</div>
	);
}
