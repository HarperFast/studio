import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { logKey } from './mergeReadLogs';

export function useLogInspection(logs: ReadLogItem[], queryKey: string, node = '*', thread = '*') {
	const [pinned, setPinned] = useState<{ key: string; logs: ReadLogItem[] } | null>(null);
	useEffect(() => {
		setPinned(current => current?.key === queryKey ? current : null);
	}, [queryKey]);
	const input = useRef({ logs, queryKey });
	input.current = { logs, queryKey };
	const pause = useCallback(() => {
		const { logs, queryKey } = input.current;
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
	const pending = useMemo(() => {
		if (!snapshot) { return 0; }
		return logs.reduce(
			(count, log) =>
				count
				+ Number(
					!known.has(logKey(log)) && (node === '*' || (log.node || '') === node)
						&& (thread === '*' || (log.thread || '') === thread),
				),
			0,
		);
	}, [logs, snapshot, known, node, thread]);
	return {
		logs: visible,
		paused: snapshot !== null,
		pending,
		pause,
		resume,
		restore,
	};
}
