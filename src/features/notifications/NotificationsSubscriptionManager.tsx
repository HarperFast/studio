import { systemStatusQueryKey } from '@/features/notifications/queries';
import { queryClient } from '@/react-query/queryClient';
import { useEffect } from 'react';

// A connection has to *stay open* this long before we trust it and reset the backoff. Resetting on
// the bare handshake instead would let a server that accepts-then-closes the upgrade (post-handshake
// auth rejection, a CM restart loop, an edge dropping non-conforming upgrades) reconnect-storm forever.
const HEALTHY_SESSION_MS = 10_000;
const MAX_BACKOFF_MS = 30_000;
// Floor between connect attempts triggered by `online`. Browsers fire that event on real interface
// transitions, but captive-portal/VPN churn can emit a burst — without this, each one would start a
// socket at the same instant and sidestep the backoff entirely.
const ONLINE_REARM_MIN_MS = 2_000;

/**
 * Subscribes to central-manager's `SystemStatus` table over Harper's automatic WebSocket endpoint and
 * refetches the notifications query on any change — "subscriptions, not polling" (#1259).
 *
 * WebSocket rather than SSE, on purpose: probing stage showed the edge buffers `text/event-stream`
 * (an SSE GET yields 0 bytes until the connection closes), whereas the WebSocket upgrade passes
 * straight through (HTTP 101) to Harper's table subscription. It connects **anonymously by design** —
 * SystemStatus is public-read broadcast content, so the banner reaches signed-out users on the sign-in
 * page too. (Note: CM's #483 anonymous-subscribe guard is scoped to `loadAsInstance = false` resources,
 * which SystemStatus is not, so this permissiveness is by omission — intentional here, not a leak.)
 *
 * Resilience: we cap the *backoff* (not the number of attempts) and keep retrying, so a transient
 * network blip can't strand the tab on the 60s poll backstop for the rest of the session. `failures`
 * only resets after a healthy session (see above); an `online` event skips the remaining wait but keeps
 * the escalation intact. Mounted once from the cloud root (StudioCloud), which never unmounts.
 *
 * Covered by NotificationsSubscriptionManager.test.tsx (fake timers + a stub WebSocket).
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
		let healthyTimer: ReturnType<typeof setTimeout> | undefined;
		let lastAttemptAt = 0;

		const clearHealthyTimer = () => {
			if (healthyTimer) {
				clearTimeout(healthyTimer);
				healthyTimer = undefined;
			}
		};

		const scheduleReconnect = () => {
			if (cancelled) { return; }
			failures += 1;
			// Cap the delay, never the attempt count. Warn once when we hit the ceiling so a persistently
			// dead feed is greppable in a RUM session (the poll backstop still keeps data fresh meanwhile).
			const delay = Math.min(1000 * 2 ** failures, MAX_BACKOFF_MS);
			if (delay === MAX_BACKOFF_MS && (1000 * 2 ** (failures - 1)) < MAX_BACKOFF_MS) {
				console.warn(
					'[notifications] SystemStatus subscription unstable; retrying at 30s (data still polls every 60s)',
				);
			}
			reconnectTimer = setTimeout(connect, delay);
		};

		function connect() {
			if (cancelled) { return; }
			lastAttemptAt = Date.now();
			let sock: WebSocket;
			try {
				sock = new WebSocket(url);
			} catch (err) {
				// Malformed URL (e.g. a relative VITE_CENTRAL_MANAGER_API_URL in some future deploy config)
				// throws synchronously — treat it as a failed attempt rather than crashing the effect.
				console.warn('[notifications] could not open SystemStatus WebSocket', err);
				scheduleReconnect();
				return;
			}
			socket = sock;
			sock.onopen = () => {
				clearHealthyTimer();
				healthyTimer = setTimeout(() => {
					failures = 0;
				}, HEALTHY_SESSION_MS);
			};
			// Any table change arrives as a message; refetch the canonical list.
			sock.onmessage = () => {
				void queryClient.invalidateQueries({ queryKey: systemStatusQueryKey });
			};
			sock.onerror = () => sock.close();
			sock.onclose = () => {
				clearHealthyTimer();
				socket = null;
				scheduleReconnect();
			};
		}

		// Connectivity came back — retry now instead of waiting out the remaining backoff. Deliberately
		// does NOT reset `failures`: skipping ahead is fine, but a burst of `online` events must not
		// unwind the escalation, or this becomes an unbounded-connect path of its own. The floor below
		// collapses such a burst into a single attempt.
		const onOnline = () => {
			if (cancelled || socket) { return; }
			if (Date.now() - lastAttemptAt < ONLINE_REARM_MIN_MS) { return; }
			if (reconnectTimer) { clearTimeout(reconnectTimer); }
			connect();
		};
		window.addEventListener('online', onOnline);

		connect();

		return () => {
			cancelled = true;
			if (reconnectTimer) { clearTimeout(reconnectTimer); }
			clearHealthyTimer();
			window.removeEventListener('online', onOnline);
			socket?.close();
		};
	}, []);

	return null;
}
