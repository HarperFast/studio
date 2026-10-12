import {
	DEFAULT_PRESET_ID,
	DEFAULT_REFRESH_MS,
	REFRESH_OPTIONS,
	TIME_PRESETS,
	type TimePresetId,
} from './analytics/context/timePresets';

/** Search-param schema for the instance Status route (`?tab&range&refresh&jobsRefresh`).
 *  Lives outside analytics/ so the route definition can validate search
 *  without pulling the lazy-loaded analytics bundle into the main chunk. */

export const STATUS_TAB_IDS = [
	'health',
	'traffic',
	'requests',
	'database',
	'replication',
	'storage',
	'overview',
	'jobs',
] as const;
export type StatusTabId = (typeof STATUS_TAB_IDS)[number];

export interface StatusSearch {
	tab: StatusTabId;
	range: TimePresetId;
	/** The chart tabs' auto-refresh. */
	refresh: number;
	/** The Jobs tab's auto-refresh. It is not `refresh`, because one URL value cannot default to 60s on the
	 *  charts and to off on Jobs: switching tabs would either start Jobs polling or reset the charts' choice. */
	jobsRefresh: number;
}

/**
 * Off, so Jobs fetches when it opens and when asked. Each poll makes Harper run an unlimited
 * `select * from system.hdb_job` over the window (harper `server/jobs/jobs.ts`); push updates are
 * HarperFast/harper#3179.
 */
export const DEFAULT_JOBS_REFRESH_MS = 0;

export const STATUS_SEARCH_DEFAULTS: StatusSearch = {
	tab: 'health',
	range: DEFAULT_PRESET_ID,
	refresh: DEFAULT_REFRESH_MS,
	jobsRefresh: DEFAULT_JOBS_REFRESH_MS,
};

function refreshOption(value: unknown, fallback: number): number {
	// `Number('')` is 0, which would silently match the "Off" refresh option —
	// treat an empty string like a missing param instead.
	const ms = value === '' ? Number.NaN : Number(value);
	return REFRESH_OPTIONS.find((o) => o.value === ms)?.value ?? fallback;
}

/** Normalizes raw search params to a valid `StatusSearch`; missing or invalid
 *  values fall back to defaults rather than erroring, so hand-edited or stale
 *  deep links degrade gracefully. */
export function validateStatusSearch(search: Record<string, unknown>): StatusSearch {
	return {
		tab: STATUS_TAB_IDS.find((t) => t === search.tab) ?? STATUS_SEARCH_DEFAULTS.tab,
		range: TIME_PRESETS.find((p) => p.id === search.range)?.id ?? STATUS_SEARCH_DEFAULTS.range,
		refresh: refreshOption(search.refresh, STATUS_SEARCH_DEFAULTS.refresh),
		jobsRefresh: refreshOption(search.jobsRefresh, STATUS_SEARCH_DEFAULTS.jobsRefresh),
	};
}
