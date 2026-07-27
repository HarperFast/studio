import { getLocalStorage } from '@/lib/storage/getLocalStorage';
import { LocalStorageKeys } from '@/lib/storage/localStorageKeys';
import { setLocalStorage } from '@/lib/storage/setLocalStorage';
import { queryClient } from '@/react-query/queryClient';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

/**
 * Client-side acknowledgement ("ignore") state for notifications, persisted to localStorage.
 *
 * We start with global notifications and no per-user backend scoping, so read/dismiss state lives on
 * the device (issue #1259). It's kept in the query cache — rather than a plain `useLocalStorage` —
 * so the bell, banner, and center all react to a change immediately (`useLocalStorage` explicitly does
 * not sync across hook instances). This grows into a server-side per-user table later.
 */
export const notificationAcksQueryKey = ['notification-acks'] as const;

function readAcks(): string[] {
	// safeParse handles malformed JSON, but valid JSON of the wrong shape (e.g. `{}` from an unrelated
	// writer) would flow through the cast and later throw "not iterable" in `[...]`/`new Set(...)`,
	// taking down bell, banner, and center at once (all globally mounted). Validate the shape here.
	const raw = getLocalStorage<unknown>(LocalStorageKeys.AckedNotificationIds, []);
	return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
}

function writeAcks(ids: string[]): void {
	// Update the in-memory cache first so the UI reacts even if persistence fails; then persist. A full
	// localStorage (Safari private mode has thrown on first write) degrades to "ack didn't survive
	// reload" rather than throwing out of an onClick and leaving the notice stuck on screen.
	queryClient.setQueryData(notificationAcksQueryKey, ids);
	try {
		setLocalStorage(LocalStorageKeys.AckedNotificationIds, ids);
	} catch (err) {
		console.warn('[notifications] could not persist acknowledgements', err);
	}
}

export function getNotificationAcksQueryOptions() {
	return queryOptions({
		queryKey: notificationAcksQueryKey,
		queryFn: readAcks,
		// Purely client-side state; never goes stale or gets garbage collected out from under us.
		staleTime: Infinity,
		gcTime: Infinity,
		// Hydrate synchronously from localStorage so the first render already reflects prior acks.
		initialData: readAcks,
	});
}

export function ackNotification(id: string): void {
	writeAcks(Array.from(new Set([...readAcks(), id])));
}

export function unackNotification(id: string): void {
	writeAcks(readAcks().filter((existing) => existing !== id));
}

/** Reactive set of acknowledged notification ids. */
export function useNotificationAcks(): Set<string> {
	const { data } = useQuery(getNotificationAcksQueryOptions());
	return useMemo(() => new Set(data ?? []), [data]);
}
