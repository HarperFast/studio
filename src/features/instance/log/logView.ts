import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { LogFiltersFormSchema } from '@/integrations/api/instance/status/logFiltersFormSchema';
import { z } from 'zod';

export type LogFilters = z.infer<typeof LogFiltersFormSchema>;
export type TimeRange = '15' | '60' | '1440' | 'latest' | 'custom';
export const DEFAULT_LOG_FILTERS: LogFilters = {
	log_name: 'hdb.log',
	limit: '100',
	level: 'undefined',
	from: '',
	until: '',
	filter: '',
};

export function localDateTime(date: Date): string {
	const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
	return local.toISOString().slice(0, 23);
}

export function withTimeRange(filters: LogFilters, range: TimeRange, now = Date.now()): LogFilters {
	if (range === 'custom') { return filters; }
	return {
		...filters,
		from: range === 'latest' ? '' : localDateTime(new Date(now - Number(range) * 60000)),
		until: '',
	};
}

export function validDateRange(from?: string | null, until?: string | null): boolean {
	const start = from ? Date.parse(from) : -Infinity;
	const end = until ? Date.parse(until) : Infinity;
	return !Number.isNaN(start) && !Number.isNaN(end) && start <= end;
}

export function surroundingFilters(filters: LogFilters, timestamp: string): LogFilters {
	const time = Date.parse(timestamp);
	return {
		...filters,
		filter: '',
		level: 'undefined',
		limit: '1000',
		from: localDateTime(new Date(time - 30000)),
		until: localDateTime(new Date(time + 30000)),
	};
}

const targetSchema = z.object({
	timestamp: z.string().max(64).refine(value =>
		Number.isFinite(Date.parse(value)) && Math.abs(Date.parse(value)) < 8640000000000000 - 30000
	),
	node: z.string().max(512),
	thread: z.string().max(256),
	fingerprint: z.string().max(32),
	source: z.enum(['hdb.log', 'system.log']),
});
export type LogTarget = z.infer<typeof targetSchema>;

function fingerprint(log: ReadLogItem): string {
	let hash = 2166136261;
	const text = JSON.stringify([log.level, log.message]);
	for (let i = 0; i < text.length; i++) { hash = Math.imul(hash ^ text.charCodeAt(i), 16777619); }
	return (hash >>> 0).toString(36);
}

export function parseLogTarget(value: unknown): LogTarget | undefined {
	if (typeof value !== 'string' || value.length > 2048) { return; }
	try {
		return targetSchema.safeParse(JSON.parse(value)).data;
	} catch {
		return;
	}
}

export function validateLogSearch(search: Record<string, unknown>): { log?: string } {
	return parseLogTarget(search.log) ? { log: search.log as string } : {};
}

export function logMatchesTarget(log: ReadLogItem, target: LogTarget): boolean {
	return Date.parse(log.timestamp) === Date.parse(target.timestamp) && (log.node ?? '') === target.node
		&& (log.thread ?? '') === target.thread && fingerprint(log) === target.fingerprint;
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
			} satisfies LogTarget,
		),
	);
	url.hash = `${path}?${search}`;
	return url.toString();
}

export function formatLogMessage(message: string): string {
	if (message.length > 100000) { return message; }
	try {
		return JSON.stringify(JSON.parse(message), null, 2);
	} catch {
		return message;
	}
}
