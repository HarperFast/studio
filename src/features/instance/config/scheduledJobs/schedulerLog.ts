/**
 * Reads Harper's own scheduler log lines, whose wording is unchanged from v5.2.0-beta.2 through v5.3.5:
 *
 * - `Job job:<app>:<name> failed after <n>ms: <error>` (warn, tagged `scheduler`; harper `resources/scheduler/engine.ts`)
 * - `Scheduler leader started on <node>` (info, tagged `scheduler`; the same file)
 * - `<Error>: Could not load component 'scheduler' for application '<app>' due to: <reason>` (error; harper
 *   `components/componentLoader.ts`). Only workers after the first log this: the first prints to the console instead,
 *   so a single-threaded instance never writes it to its log.
 *
 * A successful run logs nothing above trace, so the log can say when a job last failed, never when it last ran.
 */
import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';

export interface LoggedFailure {
	at: string;
	durationMs: number;
	error: string;
	node?: string;
}

export interface LoggedTakeover {
	at: string;
	node: string;
}

export interface LoggedLoadError {
	at: string;
	reason: string;
}

export interface SchedulerLogIndex {
	/** The newest failure of each job, keyed by its row id `job:<app>:<name>`, so a job `a` never claims `a:b`'s. */
	failures: ReadonlyMap<string, LoggedFailure>;
	/** The newest load error with a reason, by app. */
	loadErrors: ReadonlyMap<string, LoggedLoadError>;
	takeover?: LoggedTakeover;
}

const FAILURE = /^Job (job:[\s\S]*?) failed after (\d+)ms: ([\s\S]*)$/;
const TAKEOVER = 'Scheduler leader started on ';
const LOAD_ERROR = /Could not load component 'scheduler' for application '([^']*)' due to: ([\s\S]*)$/;

function keepNewest<T extends { at: string }>(map: Map<string, T>, key: string, entry: T) {
	const current = map.get(key);
	if (!current || entry.at > current.at) {
		map.set(key, entry);
	}
}

/** One pass over the lines, newest wins whatever order they arrive in: a cluster's read merges every node's log. */
export function indexSchedulerLog(log: readonly ReadLogItem[]): SchedulerLogIndex {
	const failures = new Map<string, LoggedFailure>();
	const loadErrors = new Map<string, LoggedLoadError>();
	let takeover: LoggedTakeover | undefined;
	for (const line of log) {
		const { message, timestamp: at } = line;
		if (typeof message !== 'string' || typeof at !== 'string') {
			continue;
		}
		const failure = FAILURE.exec(message);
		if (failure) {
			keepNewest(failures, failure[1], {
				at,
				durationMs: Number(failure[2]),
				error: failure[3].trim(),
				node: line.node || undefined,
			});
			continue;
		}
		if (message.startsWith(TAKEOVER)) {
			if (!takeover || at > takeover.at) {
				takeover = { at, node: message.slice(TAKEOVER.length).trim() };
			}
			continue;
		}
		const loadError = LOAD_ERROR.exec(message);
		if (loadError) {
			const reason = loadError[2]
				.split(/\r?\n\s+at /)[0]
				.replace(/\s+statusCode=\d+\s*$/, '')
				.trim();
			if (reason) {
				keepNewest(loadErrors, loadError[1], { at, reason });
			}
		}
	}
	return { failures, loadErrors, takeover };
}
