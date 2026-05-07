import type { TabId } from '../types/analytics.ts';

/** Panel identifiers. Match the existing Dashboard.tsx `overrideKey` names so
 *  the state migration is a rekey, not a rewrite. Step 2 may add/remove. */
export type PanelId =
	| 'repLatency'
	| 'memory'
	| 'cpu'
	| 'mainThread'
	| 'connections'
	| 'mqttBytesSent'
	| 'mqttBytesReceived'
	| 'mqttTrafficSent'
	| 'mqttTrafficReceived'
	| 'tableSizeSnapshot'
	| 'tableSizeTrend'
	| 'requestRate'
	| 'errorRate'
	| 'duration'
	| 'success'
	| 'transfer'
	| 'tlsReused'
	| 'connection'
	| 'cpuUsage'
	| 'dbRead'
	| 'dbWrite'
	| 'dbMessage'
	| 'response200'
	| 'utilization'
	| 'databaseSize'
	| 'storageVolume';

export interface TabConfigEntry {
	id: TabId;
	label: string;
	/** Panel IDs rendered under this tab, in display order. Empty = hide tab. */
	panels: PanelId[];
	/** Copy shown below `TimeRangeSelector` on this tab. undefined = no hint. */
	hintText?: string;
	/** Whether this tab's panels respond to NodeLegend per-node selection.
	 *  When `false`, the legend renders gray-out / non-interactive on this tab.
	 *  Default (omitted) is treated as `true`. */
	panelSupportsNodeFilter?: boolean;
}

/** Tab order is operator-first: Health leads, then external-visible, then
 *  internals. See spec §Dashboard layout for rationale. */
export const TAB_ORDER: readonly TabId[] = [
	'health',
	'traffic',
	'requests',
	'db-activity',
	'replication',
	'storage',
	'new',
];

export const TAB_CONFIG: Record<TabId, TabConfigEntry> = {
	health: {
		id: 'health',
		label: 'Health',
		panels: ['cpu', 'memory', 'mainThread', 'cpuUsage', 'utilization'],
		hintText: 'Windows <1h may grey low-count panels (min count 100).',
		panelSupportsNodeFilter: true,
	},
	traffic: {
		id: 'traffic',
		label: 'Traffic',
		panels: [
			'connections',
			'mqttTrafficSent',
			'mqttTrafficReceived',
			'mqttBytesSent',
			'mqttBytesReceived',
			'tlsReused',
			'connection',
		],
		hintText: 'Windows <1h may grey low-count panels (min count 100).',
		panelSupportsNodeFilter: false,
	},
	requests: {
		id: 'requests',
		label: 'Requests',
		panels: ['requestRate', 'errorRate', 'duration', 'success', 'transfer', 'response200'],
		hintText: 'Windows <2h may blank confidence-gated panels (min count 1000).',
		panelSupportsNodeFilter: false,
	},
	'db-activity': {
		id: 'db-activity',
		label: 'Database activity',
		panels: ['dbRead', 'dbWrite', 'dbMessage'],
		hintText: 'Per-table read/write/message latency. Top 10 tables + Other bucket.',
		panelSupportsNodeFilter: false,
	},
	replication: {
		id: 'replication',
		label: 'Replication',
		panels: ['repLatency'],
		hintText: 'Cells with <100 samples are blanked; 40–99 samples render grey.',
		panelSupportsNodeFilter: true,
	},
	storage: {
		id: 'storage',
		label: 'Storage',
		panels: ['tableSizeSnapshot', 'tableSizeTrend', 'databaseSize', 'storageVolume'],
		panelSupportsNodeFilter: true,
	},
	new: { id: 'new', label: 'New metrics', panels: [] },
};

/** Tabs to render in the TabBar. Hides tabs with zero assigned panels. */
export function visibleTabs(): TabConfigEntry[] {
	return TAB_ORDER
		.map((id) => TAB_CONFIG[id])
		.filter((t) => t.panels.length > 0);
}
