import { systemStatusQueryKey } from '@/features/notifications/queries';
import { queryClient } from '@/react-query/queryClient';
import { useEffect } from 'react';

/**
 * Subscribes to central-manager's `SystemStatus` table over Harper's automatic WebSocket endpoint and
 * refetches the notifications query on any change — "subscriptions, not polling" (#1259).
 *
 * WebSocket rather than SSE, on purpose: probing stage showed the edge buffers `text/event-stream`
 * (an SSE GET yields 0 bytes until the connection closes), whereas the WebSocket upgrade passes
 * straight through (HTTP 101) to Harper's table subscription — anonymously, matching the table's
 * public read. On any message we invalidate rather than merge deltas (the list is tiny; a refetch is
 * always correct). WebSockets don't auto-reconnect, so we back off on close and give up after a few
 * tries, leaning on the query's `refetchInterval` backstop. Mounted once from the signed-in Dashboard.
 */
export function NotificationsSubscriptionManager() {
	useEffect(() => {
		const base = import.meta.env.VITE_CENTRAL_MANAGER_API_URL;
		if (!base || typeof WebSocket === 'undefined') { return; }

		// https://host → wss://host  (and http://host → ws://host for local dev).
		const url = `${base.replace(/^http/, 'ws').replace(/\/$/, '')}/SystemStatus`;
		let socket: WebSocket | null = null;
		let cancelled = false;
		let failures = 0;
		let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

		const connect = () => {
			if (cancelled) { return; }
			socket = new WebSocket(url);
			socket.onopen = () => {
				failures = 0;
			};
			// Any table change arrives as a message; refetch the canonical list.
			socket.onmessage = () => {
				void queryClient.invalidateQueries({ queryKey: systemStatusQueryKey });
			};
			socket.onerror = () => socket?.close();
			socket.onclose = () => {
				socket = null;
				if (cancelled) { return; }
				failures += 1;
				// Give up after a handful of failures; the refetchInterval backstop keeps data fresh.
				if (failures > 5) { return; }
				reconnectTimer = setTimeout(connect, Math.min(1000 * 2 ** failures, 30_000));
			};
		};

		connect();

		return () => {
			cancelled = true;
			if (reconnectTimer) { clearTimeout(reconnectTimer); }
			socket?.close();
		};
	}, []);

	return null;
}
