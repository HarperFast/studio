import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { useMemo, useState } from 'react';
import { logKey } from './mergeReadLogs';

export function useLogInspection(logs: ReadLogItem[], queryKey: string) {
	const [pinned, setPinned] = useState<{ key: string; logs: ReadLogItem[] } | null>(null);
	const snapshot = pinned?.key === queryKey ? pinned.logs : null;
	const visible = snapshot ?? logs;
	const pending = useMemo(() => {
		if (!snapshot) { return 0; }
		const known = new Set(snapshot.map(logKey));
		return logs.reduce((count, log) => count + Number(!known.has(logKey(log))), 0);
	}, [logs, snapshot]);
	return {
		logs: visible,
		paused: snapshot !== null,
		pending,
		pause: () => setPinned(current => current?.key === queryKey ? current : { key: queryKey, logs }),
		resume: () => setPinned(null),
		restore: (saved: ReadLogItem[], key = queryKey) => setPinned({ key, logs: saved }),
	};
}
