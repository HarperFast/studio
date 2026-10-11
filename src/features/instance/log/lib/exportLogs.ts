import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { filenameTimestamp, slugifyForFilename, triggerBlobDownload } from '@/lib/download';

type LogExportFormat = 'txt' | 'json';

// The SSE tail admits any entry with a `timestamp` plus a `level` or `message`, so nothing else is guaranteed.
type LoggedEntry = Pick<ReadLogItem, 'timestamp'> & Partial<ReadLogItem>;

/**
 * Harper's own log line shape, `<timestamp> [<thread>] [<level>] [<tag>…]: <message>`, so the file splits back
 * into entries the way `read_log` splits `hdb.log`. A replicated read's `node` rides as the first tag.
 */
export function formatLogLine(entry: LoggedEntry): string {
	const tags = Array.isArray(entry.tags) ? entry.tags : [];
	const brackets = [entry.thread ?? '', entry.level ?? '', ...(entry.node ? [entry.node] : []), ...tags];
	return `${entry.timestamp} ${brackets.map((value) => `[${value}]`).join(' ')}: ${entry.message ?? ''}`;
}

export function serializeLogs(entries: readonly ReadLogItem[], format: LogExportFormat): string {
	if (format === 'json') {
		return JSON.stringify(entries, null, '\t');
	}
	return entries.map((entry) => `${formatLogLine(entry)}\n`).join('');
}

export function logExportFilename(logName: string, format: LogExportFormat, now: number = Date.now()): string {
	return `${slugifyForFilename(logName)}-${filenameTimestamp(now)}.${format}`;
}

export function downloadLogs(entries: readonly ReadLogItem[], format: LogExportFormat, logName: string): void {
	const type = format === 'json' ? 'application/json' : 'text/plain;charset=utf-8';
	triggerBlobDownload(new Blob([serializeLogs(entries, format)], { type }), logExportFilename(logName, format));
}
