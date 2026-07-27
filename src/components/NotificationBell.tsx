import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdownMenu';
import { ScrollArea } from '@/components/ui/scrollArea';
import { ackNotification, unackNotification, useNotificationAcks } from '@/features/notifications/acks';
import { NotificationLink } from '@/features/notifications/components/NotificationLink';
import { useActiveNotifications, useNow, useUnackedActiveNotifications } from '@/features/notifications/hooks';
import {
	BellIcon,
	getSeverityConfig,
	getWindowStatus,
	SEVERITY_ORDER,
} from '@/features/notifications/notificationHelpers';
import { SystemStatusNotification } from '@/integrations/api/api.patch';
import { cn } from '@/lib/cn';
import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

export function NotificationBell() {
	const [open, setOpen] = useState(false);
	const active = useActiveNotifications();
	const unacked = useUnackedActiveNotifications();
	const acks = useNotificationAcks();
	const now = useNow();

	const count = unacked.length;

	// Unacknowledged first, then by severity (most serious first).
	const ordered = useMemo(() => {
		return [...active].sort((a, b) => {
			const ackedA = acks.has(a.id) ? 1 : 0;
			const ackedB = acks.has(b.id) ? 1 : 0;
			if (ackedA !== ackedB) { return ackedA - ackedB; }
			return SEVERITY_ORDER[getSeverityConfig(a.type).severity] - SEVERITY_ORDER[getSeverityConfig(b.type).severity];
		});
	}, [active, acks]);

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="relative"
					aria-label={count > 0 ? `Notifications (${count} unread)` : 'Notifications'}
				>
					<BellIcon />
					{count > 0 && (
						<Badge
							variant="destructive"
							className="absolute -top-1 -right-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] leading-none"
						>
							{count > 9 ? '9+' : count}
						</Badge>
					)}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-96 p-0">
				<div className="flex items-center justify-between px-4 py-3">
					<span className="text-sm font-semibold">Notifications</span>
					{count > 0 && <span className="text-xs text-muted-foreground">{count} unread</span>}
				</div>
				<div className="border-t border-border" />
				{ordered.length === 0
					? (
						<div className="px-4 py-8 text-center text-sm text-muted-foreground">
							You're all caught up.
						</div>
					)
					: (
						<ScrollArea className="max-h-96">
							<ul className="divide-y divide-border">
								{ordered.map((notification) => (
									<NotificationRow
										key={notification.id}
										notification={notification}
										acked={acks.has(notification.id)}
										nowMs={now}
										onNavigate={() => setOpen(false)}
									/>
								))}
							</ul>
						</ScrollArea>
					)}
				<div className="border-t border-border" />
				<Link
					to="/notifications"
					onClick={() => setOpen(false)}
					className="block px-4 py-3 text-center text-sm font-medium text-primary hover:underline dark:text-white"
				>
					View all notifications
				</Link>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

function NotificationRow({
	notification,
	acked,
	nowMs,
	onNavigate,
}: {
	notification: SystemStatusNotification;
	acked: boolean;
	nowMs: number;
	onNavigate: () => void;
}) {
	const { Icon, iconClass } = getSeverityConfig(notification.type);
	const window = getWindowStatus(notification, nowMs);

	return (
		<li className={cn('flex gap-3 px-4 py-3', acked && 'opacity-55')}>
			<Icon className={cn('mt-0.5 size-4 shrink-0', iconClass)} />
			<div className="min-w-0 flex-1">
				<p className="text-sm text-foreground break-words">{notification.message}</p>
				<p className="mt-1 text-xs text-muted-foreground">{window.label}</p>
				<div className="mt-1 flex items-center gap-3 text-xs">
					<NotificationLink
						url={notification.url}
						onNavigate={onNavigate}
						className="font-medium text-primary hover:underline dark:text-white"
					/>
					<button
						type="button"
						className="text-muted-foreground hover:text-foreground"
						onClick={() => (acked ? unackNotification(notification.id) : ackNotification(notification.id))}
					>
						{acked ? 'Undo' : 'Ignore'}
					</button>
				</div>
			</div>
		</li>
	);
}
