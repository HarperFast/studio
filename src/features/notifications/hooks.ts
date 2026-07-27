import { useNotificationAcks } from '@/features/notifications/acks';
import { isActive } from '@/features/notifications/notificationHelpers';
import { getSystemStatusQueryOptions } from '@/features/notifications/queries';
import { SystemStatusNotification } from '@/integrations/api/api.patch';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useSyncExternalStore } from 'react';

// One shared 30s tick drives every "is this still active?" consumer (bell, banner, center) instead of
// an interval per component. Active windows only need coarse granularity, so a single clock is plenty.
const TICK_MS = 30_000;
const nowListeners = new Set<() => void>();
let nowValue = Date.now();
let nowInterval: ReturnType<typeof setInterval> | null = null;

function subscribeNow(listener: () => void): () => void {
	nowListeners.add(listener);
	if (!nowInterval) {
		nowValue = Date.now(); // refresh on (re)start so the first subscriber isn't handed a stale value
		nowInterval = setInterval(() => {
			nowValue = Date.now();
			nowListeners.forEach((l) => l());
		}, TICK_MS);
	}
	return () => {
		nowListeners.delete(listener);
		if (nowListeners.size === 0 && nowInterval) {
			clearInterval(nowInterval);
			nowInterval = null;
		}
	};
}

/** A coarse, shared clock: re-renders subscribers every 30s so active windows flip as time passes. */
export function useNow(): number {
	return useSyncExternalStore(subscribeNow, () => nowValue, () => nowValue);
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
