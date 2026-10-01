import { useNotificationAcks } from '@/features/notifications/acks';
import { isActive } from '@/features/notifications/notificationHelpers';
import { getSystemStatusQueryOptions } from '@/features/notifications/queries';
import { useNow } from '@/hooks/useNow';
import { SystemStatusNotification } from '@/integrations/api/api.patch';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

/** All notifications from the central-manager `SystemStatus` table. */
export function useNotifications() {
	return useQuery(getSystemStatusQueryOptions());
}

/** Notifications whose active window currently contains "now". */
export function useActiveNotifications(): SystemStatusNotification[] {
	const { data } = useNotifications();
	const now = useNow();
	return useMemo(() => (data ?? []).filter((notification) => isActive(notification, now)), [data, now]);
}

/**
 * Active notifications the user hasn't acknowledged — the source for the bell badge count and the
 * banner ("hey, look at me" surfaces).
 */
export function useUnackedActiveNotifications(): SystemStatusNotification[] {
	const active = useActiveNotifications();
	const acks = useNotificationAcks();
	return useMemo(() => active.filter((notification) => !acks.has(notification.id)), [active, acks]);
}
