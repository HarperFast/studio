import {
	getRestartState,
	getRestartTrackerVersion,
	RestartState,
	subscribeToRestarts,
} from '@/lib/restart/restartTracker';
import { useCallback, useMemo, useSyncExternalStore } from 'react';

/** The entity's live restart state from `restartTracker`, or `undefined` when it isn't restarting. */
export function useRestartState(entityId: string | undefined): RestartState | undefined {
	// Serialized so the snapshot is stable between renders: a fresh object per read would make
	// useSyncExternalStore re-render forever.
	const getSnapshot = useCallback(() => {
		const state = getRestartState(entityId);
		return state ? JSON.stringify(state) : '';
	}, [entityId]);
	const snapshot = useSyncExternalStore(subscribeToRestarts, getSnapshot);
	return useMemo(() => (snapshot ? JSON.parse(snapshot) as RestartState : undefined), [snapshot]);
}

/** Re-render whenever any restart starts or settles — for lists that consult the tracker per row. */
export function useRestartTrackerVersion(): number {
	return useSyncExternalStore(subscribeToRestarts, getRestartTrackerVersion);
}
