import {
	DEFAULT_PRESET_ID,
	DEFAULT_REFRESH_MS,
	REFRESH_OPTIONS,
	TIME_PRESETS,
	type TimePresetId,
} from './analytics/context/timePresets';

/** Search-param schema for the instance Status route (`?tab&range&refresh`).
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
] as const;
export type StatusTabId = (typeof STATUS_TAB_IDS)[number];

export interface StatusSearch {
	tab: StatusTabId;
	range: TimePresetId;
	refresh: number;
}

export const STATUS_SEARCH_DEFAULTS: StatusSearch = {
	tab: 'health',
	range: DEFAULT_PRESET_ID,
	refresh: DEFAULT_REFRESH_MS,
};

/** Normalizes raw search params to a valid `StatusSearch`; missing or invalid
 *  values fall back to defaults rather than erroring, so hand-edited or stale
 *  deep links degrade gracefully. */
export function validateStatusSearch(search: Record<string, unknown>): StatusSearch {
	// `Number('')` is 0, which would silently match the "Off" refresh option —
	// treat an empty string like a missing param instead.
	const refreshValue = search.refresh === '' ? Number.NaN : Number(search.refresh);
	return {
		tab: STATUS_TAB_IDS.find((t) => t === search.tab) ?? STATUS_SEARCH_DEFAULTS.tab,
		range: TIME_PRESETS.find((p) => p.id === search.range)?.id ?? STATUS_SEARCH_DEFAULTS.range,
		refresh: REFRESH_OPTIONS.find((o) => o.value === refreshValue)?.value
			?? STATUS_SEARCH_DEFAULTS.refresh,
	};
}
