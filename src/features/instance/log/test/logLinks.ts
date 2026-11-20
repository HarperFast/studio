import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { LogFilters } from '../logView';

function fingerprint(log: ReadLogItem): string {
	let hash = 2166136261;
	const text = JSON.stringify([log.level, log.message]);
	for (let i = 0; i < text.length; i++) { hash = Math.imul(hash ^ text.charCodeAt(i), 16777619); }
	return (hash >>> 0).toString(36);
}

export function buildLogLink(href: string, log: ReadLogItem, source: LogFilters['log_name']): string {
	const url = new URL(href);
	const [path, query = ''] = url.hash.slice(1).split('?');
	const search = new URLSearchParams(query);
	search.delete('filter');
	search.set(
		'log',
		JSON.stringify(
			{
				timestamp: log.timestamp,
				node: log.node ?? '',
				thread: log.thread ?? '',
				fingerprint: fingerprint(log),
				source: source ?? 'hdb.log',
			},
		),
	);
	url.hash = `${path}?${search}`;
	return url.toString();
}
