import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { logKey } from './mergeReadLogs';

export function useLogInspection(logs: ReadLogItem[], queryKey: string, node = '*', thread = '*', ready = true) {
	const [pinned, setPinned] = useState<{ key: string; logs: ReadLogItem[] } | null>(null);
	useEffect(() => {
		setPinned(current => current?.key === queryKey ? current : null);
	}, [queryKey]);
	const input = useRef({ logs, queryKey, ready });
	input.current = { logs, queryKey, ready };
	const pause = useCallback(() => {
		const { logs, queryKey, ready } = input.current;
		if (!ready) { return; }
		setPinned(current => current?.key === queryKey ? current : { key: queryKey, logs });
	}, []);
	const resume = useCallback(() => setPinned(null), []);
	const restore = useCallback(
		(saved: ReadLogItem[], key?: string) => setPinned({ key: key ?? input.current.queryKey, logs: saved }),
		[],
	);
	const snapshot = pinned?.key === queryKey ? pinned.logs : null;
	const visible = snapshot ?? logs;
	const known = useMemo(() => new Set(snapshot?.map(logKey)), [snapshot]);
	const arrivals = useMemo(() => {
		if (!snapshot) { return { pending: 0, saturated: false }; }
		let pending = 0;
		let overlap = false;
		for (const log of logs) {
			const fresh = !known.has(logKey(log));
			overlap ||= !fresh;
			if (
				fresh && (node === '*' || (log.node || '') === node) && (thread === '*' || (log.thread || '') === thread)
			) { pending++; }
		}
		return { pending, saturated: logs.length > 0 && !overlap };
	}, [logs, snapshot, known, node, thread]);
	return {
		logs: visible,
		paused: snapshot !== null,
		...arrivals,
		pause,
		resume,
		restore,
	};
}
