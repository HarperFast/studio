import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { useId } from 'react';
import { LogFilters } from '../logView';

export function LogDetails({ log, source }: {
	log: ReadLogItem;
	source: LogFilters['log_name'];
}) {
	const shortcutId = useId();
	const message = log.message ?? '';
	const validTime = Number.isFinite(Date.parse(log.timestamp));
	return (
		<div className="space-y-3 border-l-2 border-primary bg-muted/20 p-4 text-sm">
			<dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
				{Object.entries({
					Timestamp: validTime ? new Date(log.timestamp).toISOString() : log.timestamp,
					Level: log.level,
					Thread: log.thread || '—',
					Node: log.node || 'Local',
					'Log file': source ?? 'hdb.log',
					Tags: log.tags?.join(', ') || '—',
				}).map(([label, value]) => (
					<div key={label} className="min-w-0">
						<dt className="text-muted-foreground">{label}</dt>
						<dd className="mt-1 break-all font-mono select-text">{value}</dd>
					</div>
				))}
			</dl>
			<p id={shortcutId} className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
				Use <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-foreground">↑</kbd>
				{' '}
				and <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-foreground">↓</kbd>
				{' '}
				to navigate logs
			</p>
			<pre
				className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 select-text"
				aria-label="Full log message"
				aria-describedby={shortcutId}
				tabIndex={0}
			>{message}</pre>
		</div>
	);
}
