/**
 * Harper's built-in scheduler (harper `resources/scheduler`, harper#951): what an app's jobs are comes from its config
 * file, and what they did comes from `system.hdb_scheduler_state` where Harper lets Studio read it, and from Harper's
 * log before that: src/features/instance/config/scheduledJobs/DESIGN.md.
 */
import { InstanceClientConfig, InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { ReadLogItem } from '@/integrations/api/instance/status/getReadLog';
import { wasAReleasedBeforeB } from '@/lib/string/wasAReleasedBeforeB';
import { queryOptions } from '@tanstack/react-query';
import { isAxiosError } from 'axios';

/** The first tagged Harper with the scheduler plugin: v5.2.0-beta.1 predates it. */
export const SCHEDULED_JOBS_MIN_VERSION = '5.2.0-beta.2';

export function supportsScheduledJobs(version: string | undefined): boolean {
	return !!version && wasAReleasedBeforeB(SCHEDULED_JOBS_MIN_VERSION, version);
}

/**
 * The first Harper that lets a super user read `system.hdb_scheduler_state`. Before it, a super user's system-table
 * grants came from the static `json/systemSchema.json`, which doesn't list this runtime-defined table, so every read was
 * refused as "Table does not exist" and logged as an error (harper#2120, fixed by harper#2122). Studio doesn't send the
 * read to an older Harper.
 */
export const SCHEDULER_STATE_READABLE_FROM = '5.4.0-beta.1';

export function canReadSchedulerState(version: string | undefined): boolean {
	return !!version && wasAReleasedBeforeB(SCHEDULER_STATE_READABLE_FROM, version);
}

const SCHEDULER_STATE_TABLE = 'hdb_scheduler_state';

/** One job's row, `job:<app>:<job name>` (harper `resources/scheduler/engine.ts`). */
export interface SchedulerJobRun {
	lastRunAt?: string;
	lastStatus?: string;
	lastError?: string;
	lastDurationMs?: number;
}

export interface SchedulerState {
	leader?: { leaderNode?: string; lastHeartbeat?: string };
	runs: ReadonlyMap<string, SchedulerJobRun>;
}

export function schedulerJobRowId(app: string, jobName: string): string {
	return `job:${app}:${jobName}`;
}

interface SchedulerStateRow extends SchedulerJobRun {
	id: string;
	leaderNode?: string;
	lastHeartbeat?: string;
}

/** Harper creates the table when the first app with jobs loads; before that a read names it as missing. */
function isMissingTable(error: unknown): boolean {
	if (!isAxiosError(error)) {
		return false;
	}
	const items: unknown = error.response?.data?.invalid_schema_items;
	return Array.isArray(items)
		&& items.some((item) => typeof item === 'string' && item.includes(`system.${SCHEDULER_STATE_TABLE}`));
}

export async function getSchedulerState({ instanceClient }: InstanceClientConfig): Promise<SchedulerState> {
	let rows: SchedulerStateRow[];
	try {
		const { data } = await instanceClient.post<SchedulerStateRow[]>('/', {
			operation: 'search_by_value',
			database: 'system',
			table: SCHEDULER_STATE_TABLE,
			search_attribute: 'id',
			search_value: '*',
			get_attributes: ['*'],
		});
		rows = Array.isArray(data) ? data : [];
	} catch (error) {
		if (isMissingTable(error)) {
			return { runs: new Map() };
		}
		throw error;
	}
	const runs = new Map<string, SchedulerJobRun>();
	let leader: SchedulerState['leader'];
	for (const row of rows) {
		if (row.id === 'leader') {
			leader = { leaderNode: row.leaderNode, lastHeartbeat: row.lastHeartbeat };
		} else if (typeof row.id === 'string' && row.id.startsWith('job:')) {
			runs.set(row.id, {
				lastRunAt: row.lastRunAt,
				lastStatus: row.lastStatus,
				lastError: row.lastError,
				lastDurationMs: row.lastDurationMs,
			});
		}
	}
	return { leader, runs };
}

export function getSchedulerStateQueryOptions(params: InstanceClientIdConfig & { enabled: boolean }) {
	return queryOptions({
		queryKey: [params.entityId, 'scheduler', 'state'] as const,
		queryFn: () => getSchedulerState(params),
		enabled: params.enabled,
		retry: false,
		staleTime: 30_000,
	});
}

/** How many of the newest scheduler lines to read. A failing every-minute job writes 1,440 a day. */
export const SCHEDULER_LOG_LIMIT = 1000;

/**
 * The newest log lines that mention the scheduler: Harper tags its own lines `scheduler`, and an app that fails to load
 * because of a job names the `scheduler` component. `read_log`'s filter matches the tags as well as the message. A
 * cluster reads every node's log, since the leader may be any of them.
 */
export async function getSchedulerLog(
	{ instanceClient, entityType }: InstanceClientConfig & InstanceTypeConfig,
): Promise<ReadLogItem[]> {
	const { data } = await instanceClient.post<ReadLogItem[]>('/', {
		operation: 'read_log',
		start: 0,
		limit: SCHEDULER_LOG_LIMIT,
		filter: 'scheduler',
		order: 'desc',
		replicated: entityType === 'cluster',
	});
	return Array.isArray(data) ? data : [];
}

export function getSchedulerLogQueryOptions(
	params: InstanceClientIdConfig & InstanceTypeConfig & { enabled: boolean },
) {
	return queryOptions({
		queryKey: [params.entityId, 'scheduler', 'read_log'] as const,
		queryFn: () => getSchedulerLog(params),
		enabled: params.enabled,
		retry: false,
		staleTime: 30_000,
	});
}
