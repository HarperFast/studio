import { NotificationBanner } from '@/components/NotificationBanner';
import { NotificationsSubscriptionManager } from '@/features/notifications/NotificationsSubscriptionManager';
import { useOnRouteLoadTracker } from '@/integrations/datadog/datadog';
import { HeadContent, Outlet } from '@tanstack/react-router';

export function StudioCloud() {
	useOnRouteLoadTracker();
	return (
		<>
			<HeadContent />
			{
				/*
				 * Mounted at the cloud root (not the authed Dashboard) so global notices — maintenance,
				 * outages — reach signed-out users on the sign-in page too. SystemStatus read is public, and
				 * the WebSocket subscription connects anonymously. Cloud only: StudioLocal has no central-manager.
				 */
			}
			<NotificationsSubscriptionManager />
			<Outlet />
			<NotificationBanner />
		</>
	);
}
