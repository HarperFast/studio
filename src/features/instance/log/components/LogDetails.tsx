import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { useId } from 'react';
import { LogFilters } from '../logView';
import { LogTimestamp } from './LogTimestamp';

export function LogDetails({ log, source }: {
	log: ReadLogItem;
	source: LogFilters['log_name'];
}) {
	const shortcutId = useId();
	const message = log.message ?? '';
	return (
		<div className="space-y-3 border-l-2 border-primary bg-muted/20 p-4 text-sm">
			<p id={shortcutId} className="text-[11px] leading-4 text-muted-foreground">↑/↓ to navigate logs</p>
			<dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
				{Object.entries({
					Timestamp: <LogTimestamp value={log.timestamp} />,
					Level: log.level,
					Thread: log.thread || '—',
					Node: log.node || 'Local',
					'Log file': source ?? 'hdb.log',
					Tags: log.tags?.join(', ') || '—',
				}).map(([label, value]) => (
					<div key={label} className={label === 'Timestamp' ? 'min-w-0 sm:col-span-2' : 'min-w-0'}>
						<dt className="text-muted-foreground">{label}</dt>
						<dd className="mt-1 break-all font-mono select-text">{value}</dd>
					</div>
				))}
			</dl>
			<pre
				className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 select-text"
				aria-label="Full log message"
				aria-describedby={shortcutId}
				tabIndex={0}
			>{message}</pre>
		</div>
	);
}
