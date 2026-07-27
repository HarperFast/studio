import { ackNotification } from '@/features/notifications/acks';
import { NotificationLink } from '@/features/notifications/components/NotificationLink';
import { useUnackedActiveNotifications } from '@/features/notifications/hooks';
import { getSeverity, getSeverityConfig } from '@/features/notifications/notificationHelpers';
import { SystemStatusNotification } from '@/integrations/api/api.patch';
import { cn } from '@/lib/cn';
import { XIcon } from 'lucide-react';

/**
 * Full-width banner for active, un-acknowledged notifications — the "hey, look at me" surface for
 * system-wide notices (#1259). Dismissing a strip acknowledges it (localStorage), so it drops from
 * the banner and the bell badge but stays visible in the notification center.
 *
 * Anchored to the bottom of the viewport: Studio's chrome hardcodes the top band (fixed header at
 * top-0, sub-nav bars at top-20, page content at mt-32), so a top banner would require offsetting
 * every page. A bottom bar is robust on every route and never hides the primary navigation.
 */
export function NotificationBanner() {
	const unacked = useUnackedActiveNotifications();
	if (unacked.length === 0) { return null; }

	// Interrupt the screen reader for a critical notice (outage), but stay polite for info/maintenance.
	const hasCritical = unacked.some((notification) => getSeverity(notification.type) === 'critical');

	return (
		<div
			role="region"
			aria-label="System notifications"
			aria-live={hasCritical ? 'assertive' : 'polite'}
			className="fixed inset-x-0 bottom-0 z-50 flex flex-col shadow-[0_-2px_12px_rgba(0,0,0,0.12)]"
		>
			{unacked.map((notification) => <BannerStrip key={notification.id} notification={notification} />)}
		</div>
	);
}

function BannerStrip({ notification }: { notification: SystemStatusNotification }) {
	const { Icon, iconClass, bannerClass } = getSeverityConfig(notification.type);

	return (
		<div className={cn('flex items-start gap-3 border-t px-4 py-3 md:px-12', bannerClass)}>
			<Icon className={cn('mt-0.5 size-5 shrink-0', iconClass)} />
			<div className="min-w-0 flex-1 text-sm text-foreground">
				<span className="break-words">{notification.message}</span>
				<NotificationLink
					url={notification.url}
					className="ml-2 font-medium whitespace-nowrap underline underline-offset-2"
				/>
			</div>
			<button
				type="button"
				aria-label="Dismiss notification"
				onClick={() => ackNotification(notification.id)}
				className="-my-1 shrink-0 rounded p-1.5 hover:bg-foreground/10"
			>
				<XIcon className="size-4" />
			</button>
		</div>
	);
}
