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

function isNewer(a: ReadLogItem, b: ReadLogItem | undefined): boolean {
	return !b || a.timestamp > b.timestamp;
}

/** The newest failure of `app`'s job `jobName`. Lines are matched on the full prefix, so a job named `a` never claims `a:b`'s. */
export function lastLoggedFailure(
	log: readonly ReadLogItem[],
	app: string,
	jobName: string,
): LoggedFailure | undefined {
	const prefix = `Job job:${app}:${jobName} failed after `;
	let newest: ReadLogItem | undefined;
	let parsed: LoggedFailure | undefined;
	for (const line of log) {
		if (typeof line.message !== 'string' || !line.message.startsWith(prefix) || !isNewer(line, newest)) {
			continue;
		}
		const match = /^(\d+)ms: ([\s\S]*)$/.exec(line.message.slice(prefix.length));
		if (!match) {
			continue;
		}
		newest = line;
		parsed = { at: line.timestamp, durationMs: Number(match[1]), error: match[2].trim(), node: line.node || undefined };
	}
	return parsed;
}

/** The most recent node to take over running jobs. Harper logs nothing while it keeps leading, so this can be old. */
export function lastLoggedTakeover(log: readonly ReadLogItem[]): LoggedTakeover | undefined {
	const prefix = 'Scheduler leader started on ';
	let newest: ReadLogItem | undefined;
	for (const line of log) {
		if (typeof line.message === 'string' && line.message.startsWith(prefix) && isNewer(line, newest)) {
			newest = line;
		}
	}
	return newest && { at: newest.timestamp, node: newest.message.slice(prefix.length).trim() };
}

/** Harper's reason the newest load of `app` failed on its jobs, without the stack it logs after it. */
export function lastLoggedLoadError(log: readonly ReadLogItem[], app: string): LoggedLoadError | undefined {
	const marker = `Could not load component 'scheduler' for application '${app}' due to: `;
	let newest: ReadLogItem | undefined;
	let reason: string | undefined;
	for (const line of log) {
		if (typeof line.message !== 'string' || !isNewer(line, newest)) {
			continue;
		}
		const at = line.message.indexOf(marker);
		if (at < 0) {
			continue;
		}
		const candidate = line.message
			.slice(at + marker.length)
			.split(/\r?\n\s+at /)[0]
			.replace(/\s+statusCode=\d+\s*$/, '')
			.trim();
		if (candidate) {
			newest = line;
			reason = candidate;
		}
	}
	return newest && reason ? { at: newest.timestamp, reason } : undefined;
}
