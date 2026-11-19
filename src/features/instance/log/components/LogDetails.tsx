import { Button } from '@/components/ui/button';
import { useCopyTextToClipboard } from '@/hooks/useCopyToClipboard';
import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { CopyIcon, LinkIcon, ListFilterIcon } from 'lucide-react';
import { buildLogLink, formatLogMessage, LogFilters } from '../logView';

export function LogDetails({ log, source, onViewContext }: {
	log: ReadLogItem;
	source: LogFilters['log_name'];
	onViewContext: (log: ReadLogItem) => void;
}) {
	const copy = useCopyTextToClipboard();
	const validTime = Number.isFinite(Date.parse(log.timestamp));
	return (
		<div className="space-y-3 border-l-2 border-primary bg-muted/20 p-4 text-sm">
			<div className="flex flex-wrap items-center gap-2">
				<Button size="sm" variant="ghost" onClick={() => copy(log.message)}>
					<CopyIcon />Copy message
				</Button>
				<Button size="sm" variant="ghost" onClick={() => copy(JSON.stringify(log, null, 2))}>Copy JSON</Button>
				<Button
					size="sm"
					variant="ghost"
					disabled={!validTime}
					onClick={() => copy(buildLogLink(window.location.href, log, source))}
				>
					<LinkIcon />Copy link
				</Button>
				<Button size="sm" variant="defaultOutline" disabled={!validTime} onClick={() => onViewContext(log)}>
					<ListFilterIcon />View surrounding logs
				</Button>
			</div>
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
			<pre
				className="max-h-[32rem] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-6 select-text"
				aria-label="Full log message"
			>{formatLogMessage(log.message)}</pre>
		</div>
	);
}
