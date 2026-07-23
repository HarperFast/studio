import { useNotificationAcks } from '@/features/notifications/acks';
import { isActive } from '@/features/notifications/notificationHelpers';
import { getSystemStatusQueryOptions } from '@/features/notifications/queries';
import { SystemStatusNotification } from '@/integrations/api/api.patch';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

/**
 * A coarse clock that re-renders on an interval, so time-windowed "active" state flips as windows
 * open/close even when the underlying data hasn't changed.
 */
export function useNow(intervalMs = 30_000): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), intervalMs);
		return () => clearInterval(timer);
	}, [intervalMs]);
	return now;
}

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
