import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ackNotification, unackNotification, useNotificationAcks } from '@/features/notifications/acks';
import { NotificationLink } from '@/features/notifications/components/NotificationLink';
import { useNotifications, useNow } from '@/features/notifications/hooks';
import {
	getSeverityConfig,
	getWindowStatus,
	type Severity,
	toMs,
	type WindowState,
} from '@/features/notifications/notificationHelpers';
import { SystemStatusNotification } from '@/integrations/api/api.patch';
import { cn } from '@/lib/cn';

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
const STATE_ORDER: Record<WindowState, number> = { active: 0, upcoming: 1, expired: 2 };

export function NotificationsCenter() {
	const { data, isLoading } = useNotifications();
	const acks = useNotificationAcks();
	const now = useNow();

	const notifications = data ?? [];
	const sorted = [...notifications].sort((a, b) => {
		const stateA = STATE_ORDER[getWindowStatus(a, now).state];
		const stateB = STATE_ORDER[getWindowStatus(b, now).state];
		if (stateA !== stateB) { return stateA - stateB; }
		const severityDelta = SEVERITY_ORDER[getSeverityConfig(a.type).severity]
			- SEVERITY_ORDER[getSeverityConfig(b.type).severity];
		if (severityDelta !== 0) { return severityDelta; }
		// Most recently ending first within a group.
		return (toMs(b.endAt) ?? Infinity) - (toMs(a.endAt) ?? Infinity);
	});

	return (
		<div className="mt-32 px-4 pt-4 md:px-12 min-h-[calc(100vh-(--spacing(32)))]">
			<div className="max-w-3xl">
				<h1 className="text-2xl font-light">Notifications</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					System-wide notices, including maintenance windows and downstream provider incidents.
				</p>

				<div className="mt-6 flex flex-col gap-3">
					{isLoading
						? <Skeleton className="h-24 w-full" />
						: sorted.length === 0
						? (
							<p className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground dark:bg-black-dark">
								No notifications right now.
							</p>
						)
						: sorted.map((notification) => (
							<NotificationCard
								key={notification.id}
								notification={notification}
								acked={acks.has(notification.id)}
								nowMs={now}
							/>
						))}
				</div>
			</div>
		</div>
	);
}

function NotificationCard({
	notification,
	acked,
	nowMs,
}: {
	notification: SystemStatusNotification;
	acked: boolean;
	nowMs: number;
}) {
	const { Icon, iconClass, label, badgeVariant } = getSeverityConfig(notification.type);
	const window = getWindowStatus(notification, nowMs);

	return (
		<div
			className={cn(
				'flex gap-3 rounded-md border border-border bg-card p-4 dark:bg-black-dark',
				acked && 'opacity-60',
				window.state === 'expired' && 'opacity-70',
			)}
		>
			<Icon className={cn('mt-0.5 size-5 shrink-0', iconClass)} />
			<div className="min-w-0 flex-1">
				<div className="flex flex-wrap items-center gap-2">
					<Badge variant={badgeVariant}>{label}</Badge>
					{window.state !== 'active' && <Badge variant="outline" className="capitalize">{window.state}</Badge>}
					<span className="text-xs text-muted-foreground">{window.label}</span>
				</div>
				<p className="mt-2 text-sm break-words text-foreground">{notification.message}</p>
				<div className="mt-2 flex items-center gap-4 text-sm">
					<NotificationLink
						url={notification.url}
						className="font-medium text-primary hover:underline dark:text-white"
					/>
				</div>
			</div>
			<Button
				variant="ghost"
				size="sm"
				className="shrink-0 text-muted-foreground"
				onClick={() => (acked ? unackNotification(notification.id) : ackNotification(notification.id))}
			>
				{acked ? 'Undo' : 'Ignore'}
			</Button>
		</div>
	);
}
